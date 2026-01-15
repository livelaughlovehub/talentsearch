"""
Talent Finder AI - Production-ready module for talent search and candidate matching.

This module provides AI-powered tools for:
- Resume parsing and information extraction
- Skill extraction from text
- Candidate-job matching
- Finding top candidates for job postings
- Profile summarization

Usage:
    from talent_finder import TalentFinderAI
    
    # Initialize once (models load automatically)
    finder = TalentFinderAI()
    
    # Parse a resume
    parsed = finder.parse_resume("John Smith worked at Google...")
    
    # Match candidate to job
    match = finder.match_candidate_to_job(candidate_profile, job_description)
    
    # Find top candidates
    top_candidates = finder.find_top_candidates(job_description, candidate_list, top_k=5)
"""

from transformers import pipeline
from sentence_transformers import SentenceTransformer
import torch
import os
from typing import List, Dict
from sklearn.metrics.pairwise import cosine_similarity


class TalentFinderAI:
    """
    AI-powered talent search and candidate matching system.
    
    Uses multiple AI models for:
    - Named Entity Recognition (NER) for resume parsing
    - Sentence similarity for candidate-job matching
    - Text generation for profile summarization
    
    Example:
        finder = TalentFinderAI()
        match_result = finder.match_candidate_to_job(candidate_text, job_description)
    """
    
    def __init__(self, verbose: bool = False):
        """
        Initialize all AI models for talent search.
        
        Args:
            verbose: If True, print loading progress messages
        """
        if verbose:
            print("Loading Talent Finder AI models...")
            print("(This may take a moment on first run)")
        
        # Clear any expired tokens
        os.environ.pop('HF_TOKEN', None)
        os.environ.pop('HUGGINGFACE_HUB_TOKEN', None)
        
        try:
            # 1. Named Entity Recognition (extract skills, companies, names)
            if verbose:
                print("  Loading NER model...")
            self.ner = pipeline("ner", 
                               model="dslim/bert-base-NER",
                               aggregation_strategy="simple",
                               token=None)
            
            # 2. Sentence similarity for candidate-job matching
            if verbose:
                print("  Loading similarity model...")
            self.similarity_model = SentenceTransformer('all-MiniLM-L6-v2')
            
            # 3. Text generation for summaries (optional)
            if verbose:
                print("  Loading text generation model...")
            try:
                from transformers import T5ForConditionalGeneration, T5Tokenizer
                self.summarizer_tokenizer = T5Tokenizer.from_pretrained("google/flan-t5-base", token=None)
                self.summarizer_model = T5ForConditionalGeneration.from_pretrained("google/flan-t5-base", token=None)
                self.summarizer_model.eval()
                self.has_summarizer = True
            except Exception as e:
                if verbose:
                    print(f"  Warning: Could not load summarizer ({e})")
                    print("  Summarization will use fallback method. Install sentencepiece for full functionality.")
                self.has_summarizer = False
                self.summarizer_tokenizer = None
                self.summarizer_model = None
            
            if verbose:
                print("✓ All models loaded successfully!")
                
        except Exception as e:
            error_msg = f"\nError loading models: {e}\n\n"
            error_msg += "Make sure you have installed:\n"
            error_msg += "  pip install transformers sentence-transformers scikit-learn sentencepiece"
            raise ImportError(error_msg)
    
    def parse_resume(self, resume_text: str, verbose: bool = False) -> Dict:
        """
        Parse resume and extract key information.
        
        Args:
            resume_text: Full resume text
            verbose: Show detailed extraction process
        
        Returns:
            Dictionary with extracted information:
            {
                "names": List[str],
                "companies": List[str],
                "locations": List[str],
                "skills": List[str],
                "job_titles": List[str],
                "education": List[str]
            }
        """
        if verbose:
            print(f"\nParsing resume...")
            print(f"Text length: {len(resume_text)} characters")
        
        # Extract entities using NER
        entities = self.ner(resume_text)
        
        if verbose:
            print(f"Found {len(entities)} entities")
        
        # Organize entities
        extracted = {
            "names": [],
            "companies": [],
            "locations": [],
            "skills": [],
            "job_titles": [],
            "education": []
        }
        
        for entity in entities:
            entity_type = entity.get('entity_group', '')
            entity_text = entity.get('word', '')
            confidence = entity.get('score', 0)
            
            if verbose and confidence > 0.8:
                print(f"  {entity_type}: {entity_text} ({confidence:.2%})")
            
            if entity_type == 'PER':
                extracted["names"].append(entity_text)
            elif entity_type == 'ORG':
                extracted["companies"].append(entity_text)
            elif entity_type == 'LOC':
                extracted["locations"].append(entity_text)
        
        # Extract skills (common technical and soft skills)
        skills_keywords = [
            # Technical
            "python", "javascript", "java", "react", "angular", "vue", "node.js",
            "sql", "mongodb", "postgresql", "mysql", "redis",
            "aws", "azure", "gcp", "docker", "kubernetes", "jenkins",
            "git", "github", "gitlab", "ci/cd",
            "machine learning", "deep learning", "ai", "tensorflow", "pytorch",
            "html", "css", "typescript", "php", "ruby", "go", "rust",
            # Soft skills
            "leadership", "communication", "teamwork", "project management",
            "agile", "scrum", "problem solving", "analytical", "creative"
        ]
        
        resume_lower = resume_text.lower()
        for skill in skills_keywords:
            if skill in resume_lower:
                extracted["skills"].append(skill.title())
        
        # Remove duplicates
        for key in extracted:
            extracted[key] = list(set(extracted[key]))
        
        return extracted
    
    def extract_skills(self, text: str) -> List[str]:
        """
        Extract skills from text.
        
        Args:
            text: Text to extract skills from
        
        Returns:
            List of found skills
        """
        skills_keywords = [
            "python", "javascript", "java", "react", "angular", "vue", "node.js",
            "sql", "mongodb", "postgresql", "aws", "azure", "docker", "kubernetes",
            "machine learning", "ai", "tensorflow", "pytorch",
            "leadership", "communication", "project management", "agile", "scrum"
        ]
        
        text_lower = text.lower()
        found_skills = []
        for skill in skills_keywords:
            if skill in text_lower:
                found_skills.append(skill.title())
        
        return list(set(found_skills))
    
    def match_candidate_to_job(self, candidate_profile: str, job_description: str, verbose: bool = False) -> Dict:
        """
        Match candidate to job description and calculate match score.
        
        Args:
            candidate_profile: Candidate's resume/profile text
            job_description: Job requirements/description
            verbose: Show matching details
        
        Returns:
            Dictionary with match results:
            {
                "overall_match_score": float (0-1),
                "skill_match_ratio": float (0-1),
                "matched_skills": List[str],
                "missing_skills": List[str],
                "candidate_skills": List[str],
                "required_skills": List[str]
            }
        """
        if verbose:
            print(f"\nMatching candidate to job...")
            print(f"Candidate profile length: {len(candidate_profile)} chars")
            print(f"Job description length: {len(job_description)} chars")
        
        # Get embeddings for similarity
        candidate_embedding = self.similarity_model.encode(candidate_profile)
        job_embedding = self.similarity_model.encode(job_description)
        
        # Calculate cosine similarity
        similarity_score = cosine_similarity(
            [candidate_embedding],
            [job_embedding]
        )[0][0]
        
        # Extract skills
        required_skills = self.extract_skills(job_description)
        candidate_skills = self.extract_skills(candidate_profile)
        
        # Calculate skill match
        matched_skills = set(required_skills) & set(candidate_skills)
        skill_match_ratio = len(matched_skills) / len(required_skills) if required_skills else 0
        
        if verbose:
            print(f"  Overall similarity: {similarity_score:.2%}")
            print(f"  Required skills: {required_skills}")
            print(f"  Candidate skills: {candidate_skills}")
            print(f"  Matched skills: {list(matched_skills)}")
            print(f"  Skill match ratio: {skill_match_ratio:.2%}")
        
        return {
            "overall_match_score": float(similarity_score),
            "skill_match_ratio": skill_match_ratio,
            "matched_skills": list(matched_skills),
            "missing_skills": list(set(required_skills) - set(candidate_skills)),
            "candidate_skills": candidate_skills,
            "required_skills": required_skills
        }
    
    def find_top_candidates(self, job_description: str, candidate_profiles: List[str], top_k: int = 5, verbose: bool = False) -> List[Dict]:
        """
        Find best matching candidates for a job.
        
        Args:
            job_description: Job requirements
            candidate_profiles: List of candidate profile texts
            top_k: Number of top candidates to return
            verbose: Show matching process
        
        Returns:
            List of top candidates, sorted by match score (highest first).
            Each candidate dict contains:
            {
                "candidate_id": int,
                "overall_match_score": float,
                "skill_match_ratio": float,
                "matched_skills": List[str],
                "missing_skills": List[str],
                "profile_preview": str
            }
        """
        if verbose:
            print(f"\nFinding top {top_k} candidates from {len(candidate_profiles)} candidates...")
        
        results = []
        
        for i, profile in enumerate(candidate_profiles):
            if verbose:
                print(f"  Processing candidate {i+1}/{len(candidate_profiles)}...", end='\r')
            
            match_result = self.match_candidate_to_job(profile, job_description, verbose=False)
            match_result["candidate_id"] = i
            match_result["profile_preview"] = profile[:150] + "..." if len(profile) > 150 else profile
            results.append(match_result)
        
        if verbose:
            print()  # New line after progress
        
        # Sort by match score
        results.sort(key=lambda x: x["overall_match_score"], reverse=True)
        
        return results[:top_k]
    
    def summarize_profile(self, profile_text: str, max_length: int = 100) -> str:
        """
        Generate a summary of candidate profile.
        
        Args:
            profile_text: Candidate profile/resume text
            max_length: Maximum length of summary
        
        Returns:
            Summary text
        """
        if not self.has_summarizer:
            # Fallback: simple extraction
            skills = self.extract_skills(profile_text)
            parsed = self.parse_resume(profile_text)
            summary = f"Skills: {', '.join(skills[:5])}. "
            if parsed['companies']:
                summary += f"Experience at: {', '.join(parsed['companies'][:2])}."
            return summary
        
        input_text = f"Summarize this candidate profile: {profile_text[:500]}"
        inputs = self.summarizer_tokenizer(input_text, return_tensors="pt", max_length=512, truncation=True)
        
        with torch.no_grad():
            outputs = self.summarizer_model.generate(
                **inputs,
                max_length=max_length,
                temperature=0.7,
                do_sample=True
            )
        
        summary = self.summarizer_tokenizer.decode(outputs[0], skip_special_tokens=True)
        return summary

