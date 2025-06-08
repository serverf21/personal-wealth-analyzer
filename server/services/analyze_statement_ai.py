from typing import List, Dict, Any
from openai import AsyncOpenAI
from decimal import Decimal

class AITransactionAnalyzer:
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)

    async def analyze_transaction(self, transaction: Dict[str, Any]) -> Dict[str, Any]:
        prompt = f"""
        Analyze this bank transaction and categorize it:
        Date: {transaction['date']}
        Description: {transaction['particulars']}
        Amount: {transaction['amount']}
        Type: {transaction['type']}
        
        Provide:
        1. Category (TRANSPORT/FOOD/SHOPPING/UTILITIES/ENTERTAINMENT/OTHERS)
        2. Necessity level (1-5, where 1 is least necessary)
        3. Brief analysis
        """

        response = await self.client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{
                "role": "system",
                "content": "You are a financial analyst assistant."
            }, {
                "role": "user",
                "content": prompt
            }]
        )

        # Parse the response and return structured data
        analysis = response.choices[0].message.content
        return {
            **transaction,
            "ai_analysis": analysis
        }

    async def analyze_transactions(self, transactions: List[List[str]]) -> Dict[str, Any]:
        headers = transactions[0]
        data = transactions[1:]

        # Find column indices
        date_idx = headers.index("Tran Date")
        particulars_idx = headers.index("Particulars")
        debit_idx = headers.index("Debit")
        credit_idx = headers.index("Credit")

        analyzed_transactions = []
        for transaction in data:
            trans_dict = {
                "date": transaction[date_idx],
                "particulars": transaction[particulars_idx],
                "amount": transaction[debit_idx] or transaction[credit_idx],
                "type": "debit" if transaction[debit_idx] else "credit"
            }
            analyzed = await self.analyze_transaction(trans_dict)
            analyzed_transactions.append(analyzed)

        return {
            "ai_analyzed_transactions": analyzed_transactions,
            "summary": self.generate_summary(analyzed_transactions)
        }

    def generate_summary(self, analyzed_transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        # Add your summary generation logic here
        return {
            "total_transactions": len(analyzed_transactions),
            "average_necessity": sum(t.get("necessity_level", 3) for t in analyzed_transactions) / len(analyzed_transactions),
            "recommendation": "Based on the analysis..."
        }