import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.models.models import Report, ReportAnalysis, SpamSignalLog
from backend.app.core.database import utcnow

class AntiSpamService:
    @staticmethod
    def evaluate_report(
        db: Session,
        report_id: int,
        user_id: Optional[int],
        description: str,
        image_perceptual_hash: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluates report credibility, checks for bot-like rapid submissions, 
        recycled media, and text duplication.
        """
        trust_score = 1.0
        reasons: List[str] = []
        is_suspicious = False
        now = datetime.datetime.now(datetime.timezone.utc)

        # 1. Submission Rate Check (Last 10 minutes)
        if user_id:
            recent_count = db.query(func.count(Report.id)).filter(
                Report.citizen_id == user_id,
                Report.created_at >= (now - datetime.timedelta(minutes=10)),
                Report.id != report_id
            ).scalar() or 0

            if recent_count >= 5:
                trust_score -= 0.4
                reasons.append(f"High velocity submission: {recent_count} reports in last 10 minutes by user.")
            elif recent_count >= 3:
                trust_score -= 0.2
                reasons.append(f"Moderate velocity submission: {recent_count} reports in last 10 minutes.")

        # 2. Text quality & spam heuristics
        clean_desc = (description or "").strip()
        if len(clean_desc) < 10:
            trust_score -= 0.3
            reasons.append("Extremely brief report description.")
        
        # Repetitive characters / keyboard mashing (e.g., 'aaaaaa', 'asdfasdf')
        words = clean_desc.split()
        if len(words) > 0 and len(clean_desc) > 15:
            unique_chars = len(set(clean_desc.lower()))
            if unique_chars < 5:
                trust_score -= 0.5
                reasons.append("Low character diversity / possible keyboard mashing.")

        # 3. Perceptual Image Hash Duplicate Detection
        if image_perceptual_hash and len(image_perceptual_hash) == 16:
            # Look for matching hashes in ReportAnalysis from past 7 days
            week_ago = now - datetime.timedelta(days=7)
            recent_analyses = db.query(ReportAnalysis).filter(
                ReportAnalysis.image_perceptual_hash.isnot(None),
                ReportAnalysis.report_id != report_id,
                ReportAnalysis.created_at >= week_ago
            ).all()

            for item in recent_analyses:
                if item.image_perceptual_hash:
                    # Compute Hamming distance
                    try:
                        h1 = int(image_perceptual_hash, 16)
                        h2 = int(item.image_perceptual_hash, 16)
                        dist = bin(h1 ^ h2).count("1")
                        if dist <= 5: # Very similar or identical image
                            trust_score -= 0.45
                            reasons.append(f"Identical or reused photographic evidence detected (Matches report #{item.report_id}, hash distance={dist}).")
                            break
                    except ValueError:
                        pass

        trust_score = round(max(0.05, min(1.0, trust_score)), 2)
        if trust_score < 0.6:
            is_suspicious = True

        # Log into SpamSignalLog
        spam_log = SpamSignalLog(
            report_id=report_id,
            user_id=user_id,
            trust_score=trust_score,
            is_suspicious=is_suspicious,
            reasons_json=reasons,
            created_at=utcnow()
        )
        db.add(spam_log)
        db.commit()

        return {
            "trust_score": trust_score,
            "is_suspicious": is_suspicious,
            "reasons": reasons
        }
