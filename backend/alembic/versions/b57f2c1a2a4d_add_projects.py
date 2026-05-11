"""add_projects

Revision ID: b57f2c1a2a4d
Revises: 8b2b0d5b92cb
Create Date: 2026-05-11 13:00:00.000000

"""

from __future__ import annotations

from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision = "b57f2c1a2a4d"
down_revision = "8b2b0d5b92cb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_user_id"), "projects", ["user_id"], unique=False)

    op.add_column("chats", sa.Column("project_id", sa.UUID(as_uuid=False), nullable=True))
    op.create_index(op.f("ix_chats_project_id"), "chats", ["project_id"], unique=False)
    op.create_foreign_key("fk_chats_project_id_projects", "chats", "projects", ["project_id"], ["id"], ondelete="CASCADE")

    op.add_column("documents", sa.Column("project_id", sa.UUID(as_uuid=False), nullable=True))
    op.create_index(op.f("ix_documents_project_id"), "documents", ["project_id"], unique=False)
    op.create_foreign_key(
        "fk_documents_project_id_projects", "documents", "projects", ["project_id"], ["id"], ondelete="CASCADE"
    )

    bind = op.get_bind()
    users = bind.execute(sa.text("select id from users")).mappings().all()
    for user in users:
        project_id = str(uuid4())
        bind.execute(
            sa.text(
                """
                insert into projects (id, user_id, name, created_at, updated_at)
                values (:id, :user_id, 'General', now(), now())
                """
            ),
            {"id": project_id, "user_id": user["id"]},
        )
        bind.execute(sa.text("update chats set project_id = :project_id where user_id = :user_id"), {
            "project_id": project_id,
            "user_id": user["id"],
        })
        bind.execute(sa.text("update documents set project_id = :project_id where user_id = :user_id"), {
            "project_id": project_id,
            "user_id": user["id"],
        })

    op.alter_column("chats", "project_id", nullable=False)
    op.alter_column("documents", "project_id", nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_documents_project_id_projects", "documents", type_="foreignkey")
    op.drop_index(op.f("ix_documents_project_id"), table_name="documents")
    op.drop_column("documents", "project_id")

    op.drop_constraint("fk_chats_project_id_projects", "chats", type_="foreignkey")
    op.drop_index(op.f("ix_chats_project_id"), table_name="chats")
    op.drop_column("chats", "project_id")

    op.drop_index(op.f("ix_projects_user_id"), table_name="projects")
    op.drop_table("projects")
