"""ERP-specific parsers for data ingestion.

Each parser implements the IngestionStrategy interface for a specific
ERP system's export format (Yardi, MRI, etc.).
"""

from app.services.ingestion.parsers.generic import GenericMappingParser
from app.services.ingestion.parsers.mri import MRIRentRollParser
from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

__all__ = [
    "GenericMappingParser",
    "MRIRentRollParser",
    "YardiVoyagerGLParser",
]
