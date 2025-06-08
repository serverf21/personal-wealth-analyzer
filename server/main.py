### backend/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import List, Dict, Any
import pdfplumber
import io
import os
from services import BasicTransactionAnalyzer
from services import AITransactionAnalyzer

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    tables = []
    with pdfplumber.open(io.BytesIO(await file.read())) as pdf:
        print('pages length', len(pdf.pages))
        for i in range(len(pdf.pages)):
            page = pdf.pages[i]
            page_tables = page.extract_tables()
            for table in page_tables:
                tables.extend(table) 
    return {"tables": tables}  # return as JSON array


@app.post("/analyze-transactions")
async def analyze_transactions(transactions: List[List[str]], use_ai: bool = False) -> Dict[str, Any]:
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    basic_analyzer = BasicTransactionAnalyzer()
    ai_analyzer = AITransactionAnalyzer(api_key)
    try:
        # Basic analysis
        basic_analysis = basic_analyzer.analyze_transactions(transactions)
        
        if not use_ai:
            return {"analysis": basic_analysis}
        
        # AI analysis if requested
        ai_analysis = await ai_analyzer.analyze_transactions(transactions)
        
        return {
            "basic_analysis": basic_analysis,
            "ai_analysis": ai_analysis
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))