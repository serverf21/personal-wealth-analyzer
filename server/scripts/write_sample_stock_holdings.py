"""Writes client/assets/sample-stock-holdings.xlsx for local testing."""
from pathlib import Path

from openpyxl import Workbook


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    out = root / "client" / "assets" / "sample-stock-holdings.xlsx"
    out.parent.mkdir(parents=True, exist_ok=True)

    wb = Workbook()
    ws = wb.active
    ws.title = "Holdings"
    ws.append(
        [
            "Symbol",
            "ISIN",
            "Qty",
            "Avg buy price",
            "Invested",
            "Current value",
            "P&L %",
        ]
    )
    rows = [
        ["RELIANCE", "INE002A01018", 10, 2400, 24000, 28500, 18.75],
        ["TCS", "INE467B01029", 5, 3500, 17500, 18200, 4],
        ["INFY", "INE009A01021", 20, 1450, 29000, 30500, 5.2],
    ]
    for r in rows:
        ws.append(r)

    wb.save(out)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
