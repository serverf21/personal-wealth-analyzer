"""
Parse India Consolidated Account Statement (CAS) PDFs.

Primary path: open-source ``casparser`` (CAMS, KFintech, CDSL eCAS, NSDL eCAS).
Optional fallback: CAS Parser commercial API (env CAS_PARSER_API_KEY) for formats
or asset classes not covered locally (e.g. some bonds / NPS / AIF rows).
"""

from __future__ import annotations

import io
import logging
import os
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

try:
    import casparser
    from casparser.exceptions import CASParseError, IncorrectPasswordError
    from casparser.types import CASData, NSDLCASData
except ImportError:  # pragma: no cover
    casparser = None  # type: ignore
    CASParseError = Exception  # type: ignore
    IncorrectPasswordError = Exception  # type: ignore
    CASData = object  # type: ignore
    NSDLCASData = object  # type: ignore


def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, Decimal):
        return float(v)
    s = str(v).strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _dump_model(obj: Any) -> Dict[str, Any]:
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if isinstance(obj, dict):
        return obj
    return {"repr": repr(obj)}


def _build_unified_from_casdata(data: "CASData") -> Dict[str, Any]:
    holdings: List[Dict[str, Any]] = []
    d = _dump_model(data)
    for folio in data.folios:
        for scheme in folio.schemes:
            val = _num(scheme.valuation.value) if scheme.valuation else None
            holdings.append(
                {
                    "asset_class": "mutual_fund_non_demat",
                    "isin": scheme.isin,
                    "name": scheme.scheme,
                    "folio": folio.folio,
                    "amc": folio.amc,
                    "units": _num(scheme.close),
                    "nav": _num(scheme.valuation.nav) if scheme.valuation else None,
                    "value": val,
                    "rta": scheme.rta,
                    "source_detail": "CAMS/KFintech CAS",
                }
            )
    return {"format": "mutual_fund_rta", "raw_casparser": d, "holdings": holdings}


def _build_unified_from_nsdl(data: "NSDLCASData") -> Dict[str, Any]:
    holdings: List[Dict[str, Any]] = []
    d = _dump_model(data)
    for acc in data.accounts:
        acc_label = f"{getattr(acc, 'type', '')} {getattr(acc, 'dp_id', '')} {getattr(acc, 'client_id', '')}".strip()
        for eq in acc.equities:
            eqd = _dump_model(eq)
            holdings.append(
                {
                    "asset_class": "equity",
                    "isin": eq.isin,
                    "name": eq.name,
                    "quantity": _num(eq.num_shares),
                    "price": _num(eq.price),
                    "value": _num(eq.value),
                    "account_ref": acc_label or None,
                    "source_detail": "Demat equity",
                    "raw": eqd,
                }
            )
        for mf in acc.mutual_funds:
            mfd = _dump_model(mf)
            isin = mf.isin
            ac = (
                "mutual_fund_demat"
                if isin and str(isin).upper().startswith("INF")
                else "mutual_fund_demat"
            )
            holdings.append(
                {
                    "asset_class": ac,
                    "isin": isin,
                    "name": getattr(mf, "name", None),
                    "units": _num(mf.balance),
                    "nav": _num(mf.nav),
                    "value": _num(mf.value),
                    "folio": getattr(mf, "folio", None),
                    "account_ref": acc_label or None,
                    "source_detail": "Demat MF / INF",
                    "raw": mfd,
                }
            )
    return {"format": "cdsl_nsdl_demat", "raw_casparser": d, "holdings": holdings}


def summarize_holdings(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_class: Dict[str, float] = {}
    grand = 0.0
    for h in holdings:
        v = h.get("value")
        fv = float(v) if v is not None else 0.0
        ac = str(h.get("asset_class") or "other")
        by_class[ac] = by_class.get(ac, 0.0) + fv
        grand += fv
    return {
        "totals_by_asset_class": {k: round(v, 2) for k, v in sorted(by_class.items())},
        "grand_total_value": round(grand, 2),
        "line_count": len(holdings),
    }


def parse_cas_pdf_local(pdf_bytes: bytes, password: str) -> Union[CASData, NSDLCASData]:
    if casparser is None:
        raise RuntimeError("casparser is not installed")
    buf = io.BytesIO(pdf_bytes)
    # output="dict" still returns a Pydantic model (CASData or NSDLCASData).
    result = casparser.read_cas_pdf(buf, password or "", output="dict")
    if isinstance(result, dict):
        if result.get("folios") is not None:
            return CASData.model_validate(result)
        if result.get("accounts") is not None:
            return NSDLCASData.model_validate(result)
        raise CASParseError("Unrecognized casparser dict shape")
    return result


def merge_commercial_holdings(
    commercial_json: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Map commercial API JSON to a flat holdings list (best-effort)."""
    out: List[Dict[str, Any]] = []
    # Common shapes per CAS Parser docs: demat_accounts[].holdings.{equities, ...}
    demat_accounts = commercial_json.get("demat_accounts") or commercial_json.get(
        "accounts", []
    )
    for acc in demat_accounts:
        ref = f"{acc.get('dp_name', '')} {acc.get('client_id', '')}".strip()
        hmap = acc.get("holdings") or {}
        if isinstance(hmap, dict):
            hmap = {k: v for k, v in hmap.items() if isinstance(v, list)}
        else:
            hmap = {}
        for key, asset_cls in (
            ("equities", "equity"),
            ("demat_mutual_funds", "mutual_fund_demat"),
            ("mutual_funds", "mutual_fund_non_demat"),
            ("corporate_bonds", "corporate_bond"),
            ("government_securities", "g_sec"),
            ("aifs", "aif"),
            ("etfs", "etf"),
            ("nps", "nps"),
            ("insurance", "insurance"),
        ):
            for row in hmap.get(key) or []:
                if not isinstance(row, dict):
                    continue
                out.append(
                    {
                        "asset_class": asset_cls,
                        "isin": row.get("isin"),
                        "name": row.get("name") or row.get("scheme") or row.get("fund_name"),
                        "value": _num(row.get("value") or row.get("current_value")),
                        "units": _num(row.get("units") or row.get("balance")),
                        "nav": _num(row.get("nav")),
                        "account_ref": ref or None,
                        "source_detail": f"commercial_api:{key}",
                        "raw": row,
                    }
                )
        # NPS / insurance sometimes at account level
        for nps in acc.get("nps_holdings") or []:
            if isinstance(nps, dict):
                out.append(
                    {
                        "asset_class": "nps",
                        "name": nps.get("fund_name") or nps.get("scheme"),
                        "value": _num(nps.get("value")),
                        "account_ref": ref,
                        "source_detail": "commercial_api:nps",
                        "raw": nps,
                    }
                )
    # Top-level mutual_funds (non-demat) in some responses
    for mf in commercial_json.get("mutual_funds") or []:
        if isinstance(mf, dict):
            out.append(
                {
                    "asset_class": "mutual_fund_non_demat",
                    "isin": mf.get("isin"),
                    "name": mf.get("scheme_name") or mf.get("name"),
                    "folio": mf.get("folio_number"),
                    "value": _num(mf.get("value") or mf.get("current_value")),
                    "units": _num(mf.get("units")),
                    "nav": _num(mf.get("nav")),
                    "source_detail": "commercial_api:mutual_funds",
                    "raw": mf,
                }
            )
    return out


def parse_cas_commercial_sync(pdf_bytes: bytes, password: str) -> Dict[str, Any]:
    api_key = (os.getenv("CAS_PARSER_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("CAS_PARSER_API_KEY not set")
    try:
        import httpx
    except ImportError as e:
        raise RuntimeError("httpx is required for commercial CAS parsing") from e

    with httpx.Client(timeout=120.0) as client:
        files = {"pdf_file": ("statement.pdf", pdf_bytes, "application/pdf")}
        data = {"password": password or ""}
        r = client.post(
            "https://api.casparser.in/v4/smart/parse",
            headers={"x-api-key": api_key},
            files=files,
            data=data,
        )
    if r.status_code >= 400:
        logger.warning("Commercial CAS API error: %s %s", r.status_code, r.text[:500])
        raise RuntimeError(f"CAS Parser API HTTP {r.status_code}: {r.text[:300]}")
    body = r.json()
    if isinstance(body, dict) and "data" in body and isinstance(body["data"], dict):
        return body["data"]
    return body


def build_response(
    *,
    source: str,
    detected_format: str,
    unified: Optional[Dict[str, Any]] = None,
    commercial_body: Optional[Dict[str, Any]] = None,
    include_raw: bool,
    error_local: Optional[str] = None,
) -> Dict[str, Any]:
    holdings: List[Dict[str, Any]] = []
    if unified and unified.get("holdings"):
        holdings = list(unified["holdings"])
    elif commercial_body:
        holdings = merge_commercial_holdings(commercial_body)

    summary = summarize_holdings(holdings)
    out: Dict[str, Any] = {
        "source": source,
        "detected_format": detected_format,
        "summary": summary,
        "holdings": holdings,
    }
    if error_local:
        out["local_parse_error"] = error_local
    if include_raw:
        if unified and unified.get("raw_casparser") is not None:
            out["raw_casparser"] = unified["raw_casparser"]
        if commercial_body is not None:
            out["raw_commercial"] = commercial_body
    return out


def parse_cas_full_pipeline(
    pdf_bytes: bytes,
    password: str,
    *,
    prefer_commercial: bool,
    include_raw: bool,
) -> Dict[str, Any]:
    """
    Try local casparser first unless prefer_commercial and API key is set.
    If local fails or commercial-only requested, use commercial API when key is set.
    """
    if casparser is None:
        raise RuntimeError(
            "casparser is not installed. pip install 'casparser[fast]' in the server venv."
        )

    api_key = (os.getenv("CAS_PARSER_API_KEY") or "").strip()
    commercial_body: Optional[Dict[str, Any]] = None
    unified: Optional[Dict[str, Any]] = None
    detected_format = "unknown"
    local_err: Optional[str] = None

    if prefer_commercial and api_key:
        try:
            commercial_body = parse_cas_commercial_sync(pdf_bytes, password)
            detected_format = str(
                commercial_body.get("meta", {}).get("cas_type")
                or commercial_body.get("cas_type")
                or "commercial"
            )
            return build_response(
                source="commercial_api",
                detected_format=detected_format,
                unified=None,
                commercial_body=commercial_body,
                include_raw=include_raw,
            )
        except Exception as e:
            logger.warning("Commercial CAS parse failed, falling back to local: %s", e)
            local_err = f"commercial_failed:{e}"

    try:
        raw = parse_cas_pdf_local(pdf_bytes, password)
        if isinstance(raw, CASData):
            detected_format = str(raw.file_type)
            unified = _build_unified_from_casdata(raw)
        elif isinstance(raw, NSDLCASData):
            detected_format = str(raw.file_type or "NSDL/CDSL")
            unified = _build_unified_from_nsdl(raw)
        else:
            raise CASParseError(f"Unexpected return type: {type(raw)}")
    except IncorrectPasswordError as e:
        raise ValueError("Incorrect PDF password (try your PAN as printed on the CAS).") from e
    except CASParseError as e:
        local_err = str(e)
        if api_key:
            try:
                commercial_body = parse_cas_commercial_sync(pdf_bytes, password)
                detected_format = str(
                    commercial_body.get("meta", {}).get("cas_type") or "commercial"
                )
                return build_response(
                    source="commercial_api_fallback",
                    detected_format=detected_format,
                    unified=None,
                    commercial_body=commercial_body,
                    include_raw=include_raw,
                    error_local=local_err,
                )
            except Exception as e2:
                logger.error("Both local and commercial CAS parse failed: %s", e2)
        raise ValueError(
            f"Could not parse CAS PDF locally ({local_err}). "
            "For CDSL/NSDL eCAS, ensure the file is a valid CAS. "
            "Set CAS_PARSER_API_KEY for cloud parsing fallback."
        ) from e

    # If cloud was preferred but failed, keep a short note on an otherwise successful local parse.
    note: Optional[str] = None
    if local_err and str(local_err).startswith("commercial_failed"):
        note = local_err

    return build_response(
        source="local_casparser",
        detected_format=detected_format,
        unified=unified,
        commercial_body=None,
        include_raw=include_raw,
        error_local=note,
    )
