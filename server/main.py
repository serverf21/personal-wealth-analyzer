### backend/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import List, Dict, Any
from pydantic import BaseModel
import pdfplumber
import io
import os
from services import BasicTransactionAnalyzer
from services import AITransactionAnalyzer
import logging

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TransactionRequest(BaseModel):
    transactions: List[List[Any]]  # Changed from List[List[str]] to handle null values
    use_ai: bool = False

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


@app.post("/analyze-basic-transactions")
async def analyze_basic_transactions(request: TransactionRequest) -> Dict[str, Any]:
    try:
        # Convert None/null values to empty strings and ensure all values are strings
        processed_transactions = [
            [str(cell) if cell is not None else "" for cell in row]
            for row in request.transactions
        ]

        basic_analyzer = BasicTransactionAnalyzer()
        basic_analysis = basic_analyzer.analyze_transactions(processed_transactions)

        return {"basic_analysis": basic_analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Separate API endpoint for AITransactionAnalyzer
@app.post("/analyze-ai-transactions")
async def analyze_ai_transactions(request: TransactionRequest) -> Dict[str, Any]:
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        logger.error("OPENAI_API_KEY not found in environment variables")
        raise ValueError("OPENAI_API_KEY not found in environment variables")

    try:
        logger.info("Received request for AI transaction analysis")
        logger.info(f"Request data: {request.transactions}")

        # Convert None/null values to empty strings and ensure all values are strings
        processed_transactions = [
            [str(cell) if cell is not None else "" for cell in row]
            for row in request.transactions
        ]

        logger.info("Processed transactions for AI analysis")

        ai_analyzer = AITransactionAnalyzer(api_key)
        ai_analysis = await ai_analyzer.analyze_transactions(processed_transactions)

        logger.info("AI analysis completed successfully")
        return {"ai_analysis": ai_analysis}
    except Exception as e:
        logger.error(f"Error during AI transaction analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))