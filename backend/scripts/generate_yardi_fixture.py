"""Generate comprehensive Yardi GL fixture for integration tests.

Creates a realistic 500+ row Yardi GL export with:
- Full 12-month date range
- Multiple expense categories
- Both debit and credit transactions
- Realistic transaction amounts
"""

import csv
import random
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

# Configuration
FIXTURE_DIR = Path(__file__).parent.parent / "tests" / "fixtures" / "yardi"
EXPECTED_DIR = Path(__file__).parent.parent / "tests" / "fixtures" / "expected"
OUTPUT_FILE = FIXTURE_DIR / "gl_export_standard.csv"
EXPECTED_FILE = EXPECTED_DIR / "yardi_gl_standard.json"

# Ensure directories exist
FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
EXPECTED_DIR.mkdir(parents=True, exist_ok=True)

# Expense categories with account codes (5000-6999 range)
# Using simple integer codes without sub-accounts as per test expectations
EXPENSE_CATEGORIES = {
    "Taxes": [
        ("5100", "Real Estate Taxes"),
        ("5110", "Property Tax"),
        ("5120", "Business License Tax"),
    ],
    "Insurance": [
        ("5200", "Property Insurance"),
        ("5210", "Liability Insurance"),
        ("5220", "Umbrella Policy"),
    ],
    "Utilities": [
        ("5300", "Electric"),
        ("5310", "Water/Sewer"),
        ("5320", "Gas"),
        ("5330", "Trash Removal"),
    ],
    "CAM": [
        ("5400", "Common Area Maintenance"),
        ("5410", "Landscaping"),
        ("5420", "Snow Removal"),
        ("5430", "Parking Lot Maintenance"),
    ],
    "R&M": [
        ("5500", "Repairs & Maintenance"),
        ("5510", "HVAC Maintenance"),
        ("5520", "Plumbing Repairs"),
        ("5530", "Electrical Repairs"),
        ("5540", "Roof Repairs"),
    ],
    "Management Fee": [
        ("6000", "Management Fee"),
        ("6010", "Leasing Commission"),
    ],
}

# Flatten all accounts
ALL_ACCOUNTS = []
for category, accounts in EXPENSE_CATEGORIES.items():
    for account_code, description in accounts:
        ALL_ACCOUNTS.append((category, account_code, description))

# Date range: Full 12 months (2024-01-01 to 2024-12-31)
START_DATE = date(2024, 1, 1)
END_DATE = date(2024, 12, 31)

# Transaction frequency (transactions per day per account)
# More frequent for common expenses, less for irregular ones
FREQUENCY_WEIGHTS = {
    "Taxes": 0.05,  # Quarterly
    "Insurance": 0.08,  # Monthly
    "Utilities": 0.9,  # Daily
    "CAM": 0.5,  # Multiple per week
    "R&M": 0.3,  # Few per week
    "Management Fee": 0.08,  # Monthly
}

# Amount ranges by category (min, max)
AMOUNT_RANGES = {
    "Taxes": (5000, 25000),
    "Insurance": (2000, 8000),
    "Utilities": (500, 5000),
    "CAM": (300, 3000),
    "R&M": (200, 10000),
    "Management Fee": (3000, 15000),
}


def generate_amount(category: str) -> Decimal:
    """Generate realistic amount for category."""
    min_amt, max_amt = AMOUNT_RANGES[category]
    # Use normal distribution for more realistic amounts
    mean = (min_amt + max_amt) / 2
    std = (max_amt - min_amt) / 4
    amount = random.gauss(mean, std)
    # Clamp to range and round to 2 decimals
    amount = max(min_amt, min(max_amt, amount))
    return Decimal(str(round(amount, 2)))


def should_generate_transaction(category: str) -> bool:
    """Determine if transaction should be generated based on frequency."""
    return random.random() < FREQUENCY_WEIGHTS[category]


def generate_transactions():
    """Generate all transactions for the year."""
    transactions = []

    # Generate transactions for each day of the year
    current_date = START_DATE
    while current_date <= END_DATE:
        # For each account, potentially generate a transaction
        for category, account_code, description in ALL_ACCOUNTS:
            if should_generate_transaction(category):
                amount = generate_amount(category)

                # 95% debits, 5% credits (refunds/adjustments)
                is_credit = random.random() < 0.05

                transaction = {
                    "Property": "Sunset Plaza",
                    "Account Code": account_code,
                    "Account Description": description,
                    "Date": current_date.strftime(
                        "%m/%d/%Y"
                    ),  # Changed from "Transaction Date" to "Date"
                    "Debit": "" if is_credit else str(amount),
                    "Credit": str(amount) if is_credit else "",
                }
                transactions.append(transaction)

        current_date += timedelta(days=1)

    return transactions


def write_csv(transactions):
    """Write transactions to CSV with Yardi headers."""
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        # Write Yardi headers
        f.write("Yardi Voyager GL Detail Report\n")
        f.write("Report Date: 12/31/2024\n")
        f.write("Run by: System Administrator\n")
        f.write("\n")

        # Write CSV data
        fieldnames = [
            "Property",
            "Account Code",
            "Account Description",
            "Date",  # Changed from "Transaction Date" to "Date" per test expectations
            "Debit",
            "Credit",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(transactions)

    print(f"Wrote {len(transactions)} transactions to {OUTPUT_FILE}")


def calculate_expected_values(transactions):
    """Calculate expected values for test assertions."""
    total_debits = sum(Decimal(t["Debit"]) for t in transactions if t["Debit"])
    total_credits = sum(Decimal(t["Credit"]) for t in transactions if t["Credit"])
    net_amount = total_debits - total_credits

    unique_accounts = set(t["Account Code"] for t in transactions)

    expected = {
        "row_count": len(transactions),
        "account_count": len(unique_accounts),
        "total_debits": float(total_debits),
        "total_credits": float(total_credits),
        "net_amount": float(net_amount),
        "categories": list(EXPENSE_CATEGORIES.keys()),
    }

    return expected


def write_expected_json(expected):
    """Write expected values to JSON file."""
    import json

    with open(EXPECTED_FILE, "w") as f:
        json.dump(expected, f, indent=2)

    print(f"Wrote expected values to {EXPECTED_FILE}")


def main():
    """Generate fixture and expected values."""
    print("Generating Yardi GL fixture...")

    # Set seed for reproducibility
    random.seed(42)

    # Generate transactions
    transactions = generate_transactions()

    # Ensure we have 500+ transactions
    while len(transactions) < 500:
        print(f"Only {len(transactions)} transactions, generating more...")
        # Increase frequency slightly
        for key in FREQUENCY_WEIGHTS:
            FREQUENCY_WEIGHTS[key] *= 1.2
        transactions = generate_transactions()

    print(f"Generated {len(transactions)} transactions")

    # Write CSV
    write_csv(transactions)

    # Calculate and write expected values
    expected = calculate_expected_values(transactions)
    write_expected_json(expected)

    # Print summary
    print("\nSummary:")
    print(f"  Rows: {expected['row_count']}")
    print(f"  Unique accounts: {expected['account_count']}")
    print(f"  Total debits: ${expected['total_debits']:,.2f}")
    print(f"  Total credits: ${expected['total_credits']:,.2f}")
    print(f"  Net amount: ${expected['net_amount']:,.2f}")
    print(f"  Categories: {', '.join(expected['categories'])}")


if __name__ == "__main__":
    main()
