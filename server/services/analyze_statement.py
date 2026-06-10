from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal, InvalidOperation
import re
import logging

logger = logging.getLogger(__name__)

# Alias lists for each logical column — first match in headers wins
COLUMN_ALIASES: Dict[str, List[str]] = {
    "date":        ["Tran Date", "Date", "Transaction Date", "Txn Date", "VALUE DATE"],
    "particulars": ["Particulars", "Description", "Narration", "Details", "Transaction Remarks"],
    "debit":       ["Debit", "Withdrawal", "Withdrawal Amt.", "DR Amount", "Debit Amount"],
    "credit":      ["Credit", "Deposit", "Deposit Amt.", "CR Amount", "Credit Amount"],
    "balance":     ["Balance", "Bal", "Running Balance", "Closing Balance"],
}

_AMOUNT_RE = re.compile(r'^\d{1,3}(?:,\d{2,3})*\.\d{2}$')

# Substrings that identify internal sweep / flexi-FD transfers that must be
# excluded from all analysis (they are NOT real income or spending).
_SWEEP_KEYWORDS = [
    "sweep trf",        # e.g. "Sweep Trf From: 396903350024150"
    "sweep transfer",   # e.g. "SWEEP TRANSFER TO [396903350024387]"
    "sweep int",        # sweep FD interest labelled as such
    "closure proceeds", # e.g. "396903350024769 : Closure Proceeds" — FD closure credit
]

# Regex that matches lines like "396903350024150 Int:17.00 and TAX:0.00."
# — interest credits posted directly from a linked flexi/FD account number.
_FLEXI_INT_RE = re.compile(r'\d{8,}\s+int:', re.IGNORECASE)


_SUMMARY_LABELS = {"summary", "summary:", "summary :", "summary:"}


def _truncate_at_summary(rows: List[List[str]]) -> List[List[str]]:
    """Drop every row from the first 'Summary' footer row onwards."""
    for idx, row in enumerate(rows):
        for cell in row:
            if str(cell).strip().lower() in _SUMMARY_LABELS:
                return rows[:idx]
    return rows


def _is_sweep(particulars: str) -> bool:
    """
    Return True if the transaction is an internal sweep or flexi-account
    interest posting that should be excluded from analysis.

    Normalises all whitespace (including embedded newlines from PDF extraction)
    before matching so that e.g. "Closure\\nProceeds" is treated the same as
    "Closure Proceeds".
    """
    # Collapse all whitespace (spaces, tabs, newlines) to single spaces
    normalised = " ".join(particulars.lower().split())
    if any(kw in normalised for kw in _SWEEP_KEYWORDS):
        return True
    if _FLEXI_INT_RE.search(normalised):
        return True
    return False


def _normalise(s: str) -> str:
    """Lowercase + collapse whitespace for reliable comparisons."""
    return " ".join(str(s).strip().split()).lower()


def _find_col(headers: List[str], key: str) -> Optional[int]:
    """Exact (normalised) alias match — returns column index or None."""
    norm = [_normalise(h) for h in headers]
    for alias in COLUMN_ALIASES[key]:
        target = _normalise(alias)
        if target in norm:
            return norm.index(target)
    return None


def _infer_amount_cols(
    data_rows: List[List[str]], after_col: int
) -> List[int]:
    """
    Scan up to 60 data rows to find column indices (> after_col) that
    contain numeric amounts, sorted left-to-right by index.
    Returns at most 3 (debit, credit, balance).
    """
    counts: Dict[int, int] = {}
    for row in data_rows[:60]:
        for i, cell in enumerate(row):
            if i <= after_col:
                continue
            if _AMOUNT_RE.match(str(cell).strip()):
                counts[i] = counts.get(i, 0) + 1
    # Keep columns that appear in at least 2 rows (ignore noise)
    frequent = [col for col, cnt in counts.items() if cnt >= 2]
    return sorted(frequent)


def _pre_filter_sweeps(
    rows: List[List[str]],
    part_idx: int,
    date_idx: int,
    debit_idx: int,
    credit_idx: int,
) -> Tuple[List[List[str]], int]:
    """
    Remove sweep / flexi-account rows BEFORE the pending_parts merge using
    the same lookahead-buffer technique as the upload endpoint.

    Returns (filtered_rows, sweep_row_count_removed).

    Algorithm mirrors _filter_sweep_rows in main.py but uses already-known
    column indices instead of the generic _has_date_or_amount heuristic:
      - A row is "main" if it has a non-empty date, debit, or credit cell.
      - Blank/description rows are buffered.
      - When a main row is encountered we combine all buffered particulars
        with the current row's particulars and call _is_sweep.
      - If it's a sweep: discard the buffer + this main row.
      - Otherwise: flush the buffer and keep the main row.
    """
    min_col = max(part_idx, date_idx, debit_idx, credit_idx) + 1
    filtered: List[List[str]] = []
    pending: List[List[str]] = []
    removed = 0

    for row in rows:
        if len(row) < min_col:
            # Short rows can't be main rows; just buffer them
            pending.append(row)
            continue

        raw_date = (row[date_idx] or "").strip()
        raw_db   = (row[debit_idx] or "").strip()
        raw_cr   = (row[credit_idx] or "").strip()
        is_new   = bool(raw_date or raw_db or raw_cr)

        if is_new:
            raw_part_cell = (row[part_idx] or "").strip() if part_idx < len(row) else ""
            pending_parts_text = " ".join(
                (r[part_idx] or "").strip()
                for r in pending
                if part_idx < len(r) and (r[part_idx] or "").strip()
            )

            # Skip footer/total rows: amount present but no date and no description
            if not raw_date and not raw_part_cell and not pending_parts_text:
                pending = []
                continue

            parts_texts = [t for t in [pending_parts_text, raw_part_cell] if t]
            combined = " ".join(parts_texts)

            if _is_sweep(combined):
                removed += len(pending) + 1
                pending = []
            else:
                filtered.extend(pending)
                filtered.append(row)
                pending = []
        else:
            pending.append(row)

    # Flush any trailing rows that follow the last main row
    if pending:
        combined = " ".join(
            (r[part_idx] or "").strip()
            for r in pending
            if part_idx < len(r) and (r[part_idx] or "").strip()
        )
        if not _is_sweep(combined):
            filtered.extend(pending)
        else:
            removed += len(pending)

    return filtered, removed


class BasicTransactionAnalyzer:
    CATEGORIES = {
        "TRANSPORT":    ["UBER", "OLA", "METRO", "BUS", "UPSRTC", "RAPIDO"],
        "FOOD":         ["SWIGGY", "ZOMATO", "RESTAURANT", "CAFE", "BLINKIT"],
        "SHOPPING":     ["AMAZON", "FLIPKART", "MYNTRA"],
        "UTILITIES":    ["ELECTRICITY", "WATER", "GAS", "MOBILE", "INTERNET", "RECHARGE"],
        "ENTERTAINMENT":["NETFLIX", "PRIME", "PVR", "BOOKMYSHOW", "HOTSTAR"],
        "UPI":          ["UPI", "GPAY", "PHONEPE"],
        "ATM":          ["ATM", "CASH WITHDRAWAL"],
        "TRANSFER":     ["TRANSFER", "NEFT", "IMPS", "RTGS"],
    }

    def categorize_transaction(self, particulars: str) -> str:
        up = particulars.upper()
        for category, keywords in self.CATEGORIES.items():
            if any(kw in up for kw in keywords):
                return category
        return "OTHERS"

    # ------------------------------------------------------------------
    # Header / column detection
    # ------------------------------------------------------------------

    def _find_header_and_cols(
        self, transactions: List[List[str]]
    ) -> Optional[Tuple[int, int, int, int, int, Optional[int]]]:
        """
        Returns (header_row_idx, date_idx, particulars_idx,
                 debit_idx, credit_idx, balance_idx_or_None)
        or None if no usable header row is found.

        Pass 1 – exact alias match on every row.
        Pass 2 – if a row has 'date' + 'particulars' (exact) but debit/credit
                 are split/missing, infer debit/credit from the data rows
                 that follow (look for numeric-amount columns).
        """
        for idx, raw_row in enumerate(transactions):
            row = [str(c) if c is not None else "" for c in raw_row]

            # --- Pass 1: all four exact matches ---
            d  = _find_col(row, "date")
            p  = _find_col(row, "particulars")
            db = _find_col(row, "debit")
            cr = _find_col(row, "credit")
            bl = _find_col(row, "balance")

            if all(v is not None for v in (d, p, db, cr)):
                return idx, d, p, db, cr, bl

            # --- Pass 2: date + particulars found, but debit/credit missing ---
            if d is not None and p is not None:
                data_after = transactions[idx + 1:]
                amount_cols = _infer_amount_cols(data_after, after_col=p)
                if len(amount_cols) >= 2:
                    return idx, d, p, amount_cols[0], amount_cols[1], (
                        amount_cols[2] if len(amount_cols) > 2 else None
                    )

        return None

    # ------------------------------------------------------------------
    # Main analysis
    # ------------------------------------------------------------------

    def analyze_transactions(self, transactions: List[List[str]]) -> Dict[str, Any]:
        if not transactions:
            return {"error": "No transactions found"}

        result = self._find_header_and_cols(transactions)
        if result is None:
            return {
                "error": (
                    "Could not find a transaction header row. "
                    f"Expected columns like {COLUMN_ALIASES['date']} / "
                    f"{COLUMN_ALIASES['debit']} / {COLUMN_ALIASES['credit']}. "
                    f"First row found: {transactions[0]}"
                )
            }

        header_idx, date_idx, part_idx, debit_idx, credit_idx, balance_idx = result
        raw_data = transactions[header_idx + 1:]

        # Drop Summary footer rows before any further processing
        raw_data = _truncate_at_summary(raw_data)

        # ── Row-level sweep pre-filter ─────────────────────────────────────
        # Apply the same lookahead-buffer sweep detection used in the upload
        # endpoint, now that we know the exact column positions.  This catches
        # sweeps even when the frontend sends un-filtered cached data.
        data, pre_filter_removed = _pre_filter_sweeps(
            raw_data, part_idx, date_idx, debit_idx, credit_idx
        )
        if pre_filter_removed:
            logger.info(
                "analyze pre-filter removed %d sweep rows (%d → %d)",
                pre_filter_removed, len(raw_data), len(data),
            )
        # ──────────────────────────────────────────────────────────────────

        min_cols = max(date_idx, part_idx, debit_idx, credit_idx) + 1

        analyzed: Dict[str, Any] = {
            "categories": {},
            "total_debits": Decimal("0"),
            "total_credits": Decimal("0"),
            "categorized_transactions": [],
            "sweep_filtered_count": pre_filter_removed,
            "largest_debits": [],  # top-10 largest debits for user verification
        }

        # ------------------------------------------------------------------
        # Merge split rows into complete transactions.
        #
        # This PDF format places the description text BEFORE the row that
        # carries SI / date / amount.  Example:
        #
        #   ['', '', 'Sweep Trf From:', ...]      ← description of txn N+1
        #   ['6', '02-01-2026', '', '', 20000, …] ← main row for txn N+1
        #   ['', '', '396903350024203', ...]       ← account-number tail
        #
        # Strategy: buffer all "blank" rows (no date, no amount) and attach
        # them to the NEXT main row we encounter.  Any leftover buffer at the
        # very end is appended to the last transaction (account-number tails).
        # ------------------------------------------------------------------
        merged: List[Dict[str, str]] = []
        pending_parts: List[str] = []   # description lines waiting for next main row

        for row in data:
            if len(row) < min_cols:
                continue

            raw_date = (row[date_idx]  or "").strip()
            raw_part = (row[part_idx]  or "").strip()
            raw_db   = (row[debit_idx] or "").strip().replace(",", "")
            raw_cr   = (row[credit_idx]or "").strip().replace(",", "")

            is_new = bool(raw_date or raw_db or raw_cr)

            if is_new:
                # Combine buffered pre-descriptions with this row's own text
                all_parts = pending_parts + ([raw_part] if raw_part else [])
                merged.append({
                    "date":        raw_date,
                    "particulars": " ".join(all_parts).strip(),
                    "debit":       raw_db,
                    "credit":      raw_cr,
                })
                pending_parts = []
            else:
                # Blank row — buffer it for the next main row
                if raw_part:
                    pending_parts.append(raw_part)

        # Flush any trailing description lines into the last transaction
        if pending_parts and merged:
            merged[-1]["particulars"] = (
                merged[-1]["particulars"] + " " + " ".join(pending_parts)
            ).strip()

        for txn in merged:
            raw_db = txn["debit"]
            raw_cr = txn["credit"]
            raw_date = txn["date"]
            raw_part = txn["particulars"]

            # Skip rows that have no date AND no description — these are
            # footer/total rows printed at the bottom of the PDF statement
            # (e.g. "Total Withdrawals: 30,91,360.85") that must never be
            # counted as real transactions.
            if not raw_date and not raw_part:
                continue

            # Second-pass sweep guard (catches anything the pre-filter missed)
            if _is_sweep(raw_part):
                analyzed["sweep_filtered_count"] += 1
                continue

            try:
                debit_amt  = Decimal(raw_db) if raw_db  else Decimal("0")
                credit_amt = Decimal(raw_cr) if raw_cr  else Decimal("0")
            except InvalidOperation:
                continue  # skip rows with non-numeric amounts

            txn_type = "debit" if debit_amt else "credit"
            txn_amount = debit_amt if debit_amt else credit_amt

            if not txn_amount:
                continue  # skip zero-amount rows entirely

            category = self.categorize_transaction(raw_part) if raw_part else "OTHERS"

            # Spending categories are based on DEBITS only.
            if debit_amt:
                analyzed["categories"].setdefault(category, Decimal("0"))
                analyzed["categories"][category] += debit_amt
                analyzed["largest_debits"].append({
                    "date":        raw_date,
                    "particulars": raw_part,
                    "amount":      str(debit_amt),
                    "category":    category,
                })

            analyzed["categorized_transactions"].append({
                "date":        raw_date,
                "particulars": raw_part,
                "amount":      str(txn_amount),
                "type":        txn_type,
                "category":    category,
            })

        # Keep only the 10 largest debits, sorted descending
        analyzed["largest_debits"].sort(key=lambda x: Decimal(x["amount"]), reverse=True)
        analyzed["largest_debits"] = analyzed["largest_debits"][:10]

        # Derive totals directly from categorized_transactions so they are
        # always guaranteed to match exactly what is displayed in the UI.
        analyzed["total_debits"] = sum(
            Decimal(t["amount"])
            for t in analyzed["categorized_transactions"]
            if t["type"] == "debit"
        )
        analyzed["total_credits"] = sum(
            Decimal(t["amount"])
            for t in analyzed["categorized_transactions"]
            if t["type"] == "credit"
        )

        return analyzed
