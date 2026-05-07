"""change_document_embedding_dimension

Revision ID: 8b2b0d5b92cb
Revises: 73c8addc2f2f
Create Date: 2026-05-07 11:35:00.000000

"""

from alembic import op


revision = "8b2b0d5b92cb"
down_revision = "73c8addc2f2f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE document_embeddings ALTER COLUMN embedding TYPE vector(3072)")


def downgrade() -> None:
    op.execute("ALTER TABLE document_embeddings ALTER COLUMN embedding TYPE vector(768)")
