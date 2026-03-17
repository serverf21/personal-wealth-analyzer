### backend/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
import pdfplumber
import io
import os
from services import BasicTransactionAnalyzer
from services import AITransactionAnalyzer
import logging
from openpyxl import load_workbook
from datetime import datetime, date

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

def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    s = s.replace(",", "")
    try:
        return float(s)
    except Exception:
        return None

def _safe_percent(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    if s.endswith("%"):
        s = s[:-1].strip()
    s = s.replace(",", "")
    try:
        return float(s)
    except Exception:
        return None

def _find_first_text_cell(rows: List[List[Any]], text: str) -> Optional[Tuple[int, int]]:
    target = text.strip().lower()
    for r_idx, row in enumerate(rows):
        for c_idx, cell in enumerate(row):
            if isinstance(cell, str) and cell.strip().lower() == target:
                return (r_idx, c_idx)
    return None

def _as_on_from_heading(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    # Expected: "HOLDINGS AS ON YYYY-MM-DD"
    prefix = "holdings as on"
    lower = s.lower()
    if prefix in lower:
        idx = lower.find(prefix) + len(prefix)
        rest = s[idx:].strip()
        # Try ISO date first
        try:
            d = datetime.strptime(rest, "%Y-%m-%d").date()
            return d.isoformat()
        except Exception:
            pass
        # Try DD-MM-YYYY
        try:
            d = datetime.strptime(rest, "%d-%m-%Y").date()
            return d.isoformat()
        except Exception:
            return rest
    return None

@app.post("/upload-mf-holdings-excel")
async def upload_mf_holdings_excel(file: UploadFile = File(...)) -> Dict[str, Any]:
    try:
        raw = await file.read()
        wb = load_workbook(filename=io.BytesIO(raw), data_only=True)
        if "Holdings" in wb.sheetnames:
            ws = wb["Holdings"]
        else:
            ws = wb[wb.sheetnames[0]]

        rows: List[List[Any]] = []
        max_col = ws.max_column or 1
        for r in range(1, (ws.max_row or 1) + 1):
            row = []
            for c in range(1, max_col + 1):
                row.append(ws.cell(row=r, column=c).value)
            rows.append(row)

        # Profile
        profile: Dict[str, Any] = {}
        for label, key in [("Name", "name"), ("Mobile Number", "mobile"), ("PAN", "pan")]:
            pos = _find_first_text_cell(rows, label)
            if pos:
                r, c = pos
                val = rows[r][c + 1] if c + 1 < len(rows[r]) else None
                if val is not None and str(val).strip():
                    profile[key] = str(val).strip()

        # Summary
        summary: Dict[str, Any] = {}
        as_on: Optional[str] = None
        for row in rows:
            if as_on:
                break
            for cell in row:
                maybe = _as_on_from_heading(cell)
                if maybe:
                    as_on = maybe
                    break
        if as_on:
            summary["as_on"] = as_on

        summary_header_pos = None
        for i, row in enumerate(rows):
            if any(isinstance(cell, str) and cell.strip().lower() == "total investments" for cell in row):
                summary_header_pos = i
                break
        if summary_header_pos is not None and summary_header_pos + 1 < len(rows):
            header_row = [str(x).strip() if x is not None else "" for x in rows[summary_header_pos]]
            value_row = rows[summary_header_pos + 1]
            for idx, h in enumerate(header_row):
                v = value_row[idx] if idx < len(value_row) else None
                h_lower = h.lower()
                if h_lower == "total investments":
                    summary["total_invested"] = _safe_float(v)
                elif h_lower == "current portfolio value":
                    summary["current_value"] = _safe_float(v)
                elif h_lower == "profit/loss":
                    summary["profit_loss"] = _safe_float(v)
                elif h_lower == "profit/loss %":
                    summary["profit_loss_pct"] = _safe_percent(v)
                elif h_lower == "xirr":
                    summary["xirr_pct"] = _safe_percent(v)

        # Holdings table
        holdings: List[Dict[str, Any]] = []
        holdings_header_idx = None
        for i, row in enumerate(rows):
            if any(isinstance(cell, str) and cell.strip().lower() == "scheme name" for cell in row):
                holdings_header_idx = i
                break
        if holdings_header_idx is None:
            raise HTTPException(status_code=400, detail="Could not find holdings header row (Scheme Name).")

        header = [str(x).strip() if x is not None else "" for x in rows[holdings_header_idx]]
        col = {h.lower(): idx for idx, h in enumerate(header) if h}

        def get(row: List[Any], key: str) -> Any:
            idx = col.get(key)
            return row[idx] if idx is not None and idx < len(row) else None

        for row in rows[holdings_header_idx + 1 :]:
            scheme = get(row, "scheme name")
            if scheme is None or (isinstance(scheme, str) and not scheme.strip()):
                continue
            entry = {
                "scheme_name": str(scheme).strip(),
                "amc": (str(get(row, "amc")).strip() if get(row, "amc") is not None else None),
                "category": (str(get(row, "category")).strip() if get(row, "category") is not None else None),
                "sub_category": (str(get(row, "sub-category")).strip() if get(row, "sub-category") is not None else None),
                "folio_no": (str(get(row, "folio no.")).strip() if get(row, "folio no.") is not None else None),
                "source": (str(get(row, "source")).strip() if get(row, "source") is not None else None),
                "units": _safe_float(get(row, "units")),
                "invested_value": _safe_float(get(row, "invested value")),
                "current_value": _safe_float(get(row, "current value")),
                "returns_value": _safe_float(get(row, "returns")),
                "xirr_pct": _safe_percent(get(row, "xirr")),
            }
            holdings.append(entry)

        # Computed allocations & concentration
        def sum_by(key: str) -> List[Dict[str, Any]]:
            buckets: Dict[str, float] = {}
            for h in holdings:
                k = h.get(key) or "Unknown"
                v = h.get("current_value") or 0.0
                buckets[str(k)] = buckets.get(str(k), 0.0) + float(v)
            out = [{"name": k, "value": round(v, 2)} for k, v in buckets.items()]
            out.sort(key=lambda x: x["value"], reverse=True)
            return out

        total_current = sum((h.get("current_value") or 0.0) for h in holdings) or 0.0
        top_schemes: Dict[str, float] = {}
        for h in holdings:
            name = h.get("scheme_name") or "Unknown"
            top_schemes[str(name)] = top_schemes.get(str(name), 0.0) + float(h.get("current_value") or 0.0)
        top_schemes_list = [{"name": k, "value": round(v, 2), "pct": round((v / total_current) * 100, 2) if total_current else 0.0} for k, v in top_schemes.items()]
        top_schemes_list.sort(key=lambda x: x["value"], reverse=True)

        computed = {
            "counts": {
                "rows": len(holdings),
                "unique_schemes": len(set(h.get("scheme_name") for h in holdings)),
                "unique_amcs": len(set(h.get("amc") for h in holdings)),
                "unique_folios": len(set(h.get("folio_no") for h in holdings)),
                "unique_sources": len(set(h.get("source") for h in holdings)),
            },
            "total_current_from_rows": round(float(total_current), 2),
            "allocation_by_category": sum_by("category"),
            "allocation_by_sub_category": sum_by("sub_category"),
            "allocation_by_amc": sum_by("amc"),
            "allocation_by_source": sum_by("source"),
            "top_schemes_by_current_value": top_schemes_list[:10],
        }

        return {"profile": profile, "summary": summary, "holdings": holdings, "computed": computed}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing MF holdings excel: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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