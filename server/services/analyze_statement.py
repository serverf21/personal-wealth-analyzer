from typing import List, Dict, Any
from decimal import Decimal

class BasicTransactionAnalyzer:
    CATEGORIES = {
        'TRANSPORT': ['UBER', 'OLA', 'METRO', 'BUS', 'UPSRTC'],
        'FOOD': ['SWIGGY', 'ZOMATO', 'RESTAURANT', 'CAFE'],
        'SHOPPING': ['AMAZON', 'FLIPKART', 'MYNTRA'],
        'UTILITIES': ['ELECTRICITY', 'WATER', 'GAS', 'MOBILE', 'INTERNET'],
        'ENTERTAINMENT': ['NETFLIX', 'PRIME', 'PVR', 'BOOKMYSHOW'],
        'UPI': ['UPI', 'GPAY', 'PHONEPE'],
        'ATM': ['ATM', 'WITHDRAWAL'],
        'TRANSFER': ['TRANSFER', 'NEFT', 'IMPS', 'RTGS']
    }

    def categorize_transaction(self, particulars: str) -> str:
        particulars_upper = particulars.upper()
        for category, keywords in self.CATEGORIES.items():
            if any(keyword in particulars_upper for keyword in keywords):
                return category
        return 'OTHERS'

    def analyze_transactions(self, transactions: List[List[str]]) -> Dict[str, Any]:
        if not transactions:
            return {"error": "No transactions found"}

        # Remove header row and process transactions
        headers = transactions[0]
        data = transactions[1:]

        # Find column indices
        date_idx = headers.index("Tran Date")
        particulars_idx = headers.index("Particulars")
        debit_idx = headers.index("Debit")
        credit_idx = headers.index("Credit")
        balance_idx = headers.index("Balance")

        analyzed_data = {
            "categories": {},
            "total_debits": Decimal('0'),
            "total_credits": Decimal('0'),
            "categorized_transactions": []
        }

        for transaction in data:
            category = self.categorize_transaction(transaction[particulars_idx])
            amount = Decimal(transaction[debit_idx] or '0') or Decimal(transaction[credit_idx] or '0')
            
            # Update category totals
            if category not in analyzed_data["categories"]:
                analyzed_data["categories"][category] = Decimal('0')
            analyzed_data["categories"][category] += amount

            # Update totals
            if transaction[debit_idx]:
                analyzed_data["total_debits"] += Decimal(transaction[debit_idx])
            if transaction[credit_idx]:
                analyzed_data["total_credits"] += Decimal(transaction[credit_idx])

            # Store categorized transaction
            analyzed_data["categorized_transactions"].append({
                "date": transaction[date_idx],
                "particulars": transaction[particulars_idx],
                "amount": str(amount),
                "type": "debit" if transaction[debit_idx] else "credit",
                "category": category
            })

        return analyzed_data