from typing import List, Tuple
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from backend.app.ai.normalizer import normalize_text

class SemanticSimilarityEngine:
    """
    Computes text semantic similarity between civic reports.
    Uses TF-IDF character and word n-grams with cosine similarity.
    Provides deterministic fallback when single-sample or empty.
    """
    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            analyzer='word',
            ngram_range=(1, 3),
            min_df=1,
            sublinear_tf=True
        )

    def compute_similarity(self, text_a: str, text_b: str) -> float:
        norm_a, _ = normalize_text(text_a)
        norm_b, _ = normalize_text(text_b)

        if not norm_a or not norm_b:
            return 0.0

        if norm_a == norm_b:
            return 1.0

        # Quick token overlap Jaccard fallback
        tokens_a = set(norm_a.split())
        tokens_b = set(norm_b.split())
        if not tokens_a or not tokens_b:
            return 0.0

        jaccard = len(tokens_a & tokens_b) / float(len(tokens_a | tokens_b))

        # Check shared domain civic concepts
        civic_concepts = {
            "water": {"water", "drinking", "pressure", "pipeline", "pipe", "leak", "kudineer", "tap"},
            "road": {"pothole", "road", "footpath", "tar", "tarmac", "salai", "pallam", "crater"},
            "waste": {"garbage", "waste", "trash", "bin", "kuppai", "dump", "rotting", "stench"},
            "drain": {"drain", "drainage", "sewage", "flood", "waterlogging", "manhole", "saakadai"},
            "light": {"light", "streetlight", "lamp", "dark", "pole", "fused"},
            "power": {"electric", "wire", "power", "spark", "transformer", "tneb"}
        }

        shared_concept_boost = 0.0
        for concept, terms in civic_concepts.items():
            if (tokens_a & terms) and (tokens_b & terms):
                shared_concept_boost = 0.35
                break

        try:
            tfidf_matrix = self.vectorizer.fit_transform([norm_a, norm_b])
            cos_sim = float(cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0])
            score = 0.5 * cos_sim + 0.2 * jaccard + shared_concept_boost
            return round(min(1.0, max(0.0, score)), 3)
        except Exception:
            return round(min(1.0, jaccard + shared_concept_boost), 3)

    def find_similar_reports(self, target_text: str, candidate_texts: List[str]) -> List[float]:
        """
        Computes similarity vector for target_text against list of candidates.
        """
        if not candidate_texts:
            return []

        norm_target, _ = normalize_text(target_text)
        normalized_candidates = [normalize_text(t)[0] for t in candidate_texts]

        corpus = [norm_target] + normalized_candidates
        try:
            tfidf_matrix = self.vectorizer.fit_transform(corpus)
            similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()
            return [round(float(s), 3) for s in similarities]
        except Exception:
            return [self.compute_similarity(target_text, c) for c in candidate_texts]

similarity_engine = SemanticSimilarityEngine()
