### backend/main.py
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber # type: ignore
import io

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
