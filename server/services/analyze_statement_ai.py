from typing import List, Dict, Any
from openai import AsyncOpenAI
from decimal import Decimal
import asyncio

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
        1. Category (Design categories like 'GROCERIES', 'ENTERTAINMENT', 'UTILITIES', etc. as per the given data)
        2. Necessity level (1-5, where 1 is least necessary)
        3. Brief analysis
        """

        try:
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

            # Parse the response and extract structured data
            analysis = (response.choices[0].message.content or '').strip()
            category, necessity_level, brief_analysis = self.parse_analysis(analysis)

            return {
                **transaction,
                "category": category,
                "necessity_level": necessity_level,
                "ai_analysis": brief_analysis
            }
        except Exception as e:
            # Handle API errors gracefully
            return {
                **transaction,
                "category": "UNKNOWN",
                "necessity_level": 3,
                "ai_analysis": f"Error: {str(e)}"
            }

    def parse_analysis(self, analysis: str) -> tuple:
        """
        Parse the AI response to extract category, necessity level, and brief analysis.
        """
        try:
            lines = analysis.split("\n")
            category = lines[0].split(":")[1].strip()
            necessity_level = int(lines[1].split(":")[1].strip())
            brief_analysis = lines[2].split(":")[1].strip()
            return category, necessity_level, brief_analysis
        except (IndexError, ValueError):
            # Fallback in case of parsing errors
            return "OTHERS", 3, "Unable to parse AI response."

    async def analyze_transactions(self, transactions: List[List[str]]) -> Dict[str, Any]:
        headers = transactions[0]
        data = transactions[1:]

        # Find column indices
        date_idx = headers.index("Tran Date")
        particulars_idx = headers.index("Particulars")
        debit_idx = headers.index("Debit")
        credit_idx = headers.index("Credit")

        analyzed_transactions = []
        tasks = []
        for transaction in data:
            trans_dict = {
                "date": transaction[date_idx],
                "particulars": transaction[particulars_idx],
                "amount": transaction[debit_idx] or transaction[credit_idx],
                "type": "debit" if transaction[debit_idx] else "credit"
            }
            tasks.append(self.analyze_transaction(trans_dict))

        # Run all tasks concurrently
        analyzed_transactions = await asyncio.gather(*tasks)

        return {
            "ai_analyzed_transactions": analyzed_transactions,
            "summary": self.generate_summary(analyzed_transactions)
        }

    def generate_summary(self, analyzed_transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        total_necessity = 0
        total_transactions = len(analyzed_transactions)

        for transaction in analyzed_transactions:
            total_necessity += transaction.get("necessity_level", 3)

        average_necessity = total_necessity / total_transactions if total_transactions > 0 else 3

        return {
            "total_transactions": total_transactions,
            "average_necessity": average_necessity,
            "recommendation": "Consider reducing spending on non-essential categories."
        }