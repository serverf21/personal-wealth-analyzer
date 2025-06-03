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
    content = ""
    with pdfplumber.open(io.BytesIO(await file.read())) as pdf:
        for page in pdf.pages:
            content += page.extract_text() or ""
    return {"text": content[:1000]}  # return preview