"""initial: baseline schema (9 tables)

Revision ID: 0e99e2c0433d
Revises:
Create Date: 2026-05-28 16:52:34.026217
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0e99e2c0433d'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- physical_shelves ----
    op.create_table(
        'physical_shelves',
        sa.Column('physical_shelf_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('location_code', sa.String(100), nullable=False),
        sa.Column('location_name', sa.String(200), nullable=True),
        sa.Column('nfc_tag_uid', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('physical_shelf_id'),
        sa.UniqueConstraint('nfc_tag_uid'),
    )

    # ---- logical_shelves ----
    op.create_table(
        'logical_shelves',
        sa.Column('logical_shelf_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('shelf_name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('logical_shelf_id'),
    )

    # ---- physical_logical_mappings ----
    op.create_table(
        'physical_logical_mappings',
        sa.Column('mapping_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('physical_shelf_id', sa.Integer(), sa.ForeignKey('physical_shelves.physical_shelf_id'), nullable=False),
        sa.Column('logical_shelf_id', sa.Integer(), sa.ForeignKey('logical_shelves.logical_shelf_id'), nullable=False),
        sa.Column('mapping_type', sa.String(20), server_default=sa.text("'one_to_one'"), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=True),
        sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('mapping_id'),
    )

    # ---- book_metadata ----
    op.create_table(
        'book_metadata',
        sa.Column('book_id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('isbn', sa.String(20), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('author', sa.String(300), nullable=True),
        sa.Column('translator', sa.String(300), nullable=True),
        sa.Column('publisher', sa.String(200), nullable=True),
        sa.Column('publish_date', sa.String(50), nullable=True),
        sa.Column('cover_url', sa.String(500), nullable=True),
        sa.Column('local_cover_path', sa.String(200), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('pages', sa.Integer(), nullable=True),
        sa.Column('price', sa.String(50), nullable=True),
        sa.Column('binding', sa.String(50), nullable=True),
        sa.Column('original_title', sa.String(300), nullable=True),
        sa.Column('series', sa.String(200), nullable=True),
        sa.Column('rating', sa.String(10), nullable=True),
        sa.Column('douban_url', sa.String(300), nullable=True),
        sa.Column('source', sa.String(20), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(), nullable=True),
        sa.Column('sync_status', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('book_id'),
        sa.UniqueConstraint('isbn'),
        sa.Index('idx_book_title_search', 'title'),
        sa.Index('idx_book_author_search', 'author'),
        sa.Index('idx_book_source_filter', 'source'),
        sa.Index('idx_book_rating_sort', 'rating'),
    )

    # ---- logical_shelf_books ----
    op.create_table(
        'logical_shelf_books',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('logical_shelf_id', sa.Integer(), sa.ForeignKey('logical_shelves.logical_shelf_id'), nullable=False),
        sa.Column('book_id', sa.Integer(), sa.ForeignKey('book_metadata.book_id'), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default=sa.text('0'), nullable=True),
        sa.Column('status', sa.String(20), server_default=sa.text("'in_shelf'"), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('added_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # ---- sync_logs ----
    op.create_table(
        'sync_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('book_id', sa.Integer(), sa.ForeignKey('book_metadata.book_id', ondelete='CASCADE'), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('source', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # ---- activity_logs ----
    op.create_table(
        'activity_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('action', sa.String(50), nullable=True),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('entity_type', sa.String(50), nullable=True),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(20), server_default=sa.text("'success'"), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.Index('idx_activity_log_action', 'action', 'created_at'),
        sa.Index('idx_activity_log_entity', 'entity_type', 'entity_id'),
    )

    # ---- import_tasks ----
    op.create_table(
        'import_tasks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('task_id', sa.String(50), nullable=False),
        sa.Column('file_name', sa.String(200), nullable=True),
        sa.Column('total', sa.Integer(), server_default=sa.text('0'), nullable=True),
        sa.Column('completed', sa.Integer(), server_default=sa.text('0'), nullable=True),
        sa.Column('success', sa.Integer(), server_default=sa.text('0'), nullable=True),
        sa.Column('failed', sa.Integer(), server_default=sa.text('0'), nullable=True),
        sa.Column('synced', sa.Integer(), server_default=sa.text('0'), nullable=True),
        sa.Column('skipped', sa.Integer(), server_default=sa.text('0'), nullable=True),
        sa.Column('status', sa.String(20), server_default=sa.text("'pending'"), nullable=True),
        sa.Column('results', sa.Text(), nullable=True),
        sa.Column('errors', sa.Text(), nullable=True),
        sa.Column('options', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('task_id'),
    )

    # ---- nfc_write_tasks ----
    op.create_table(
        'nfc_write_tasks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('task_id', sa.String(50), nullable=False),
        sa.Column('shelf_id', sa.Integer(), nullable=False),
        sa.Column('shelf_name', sa.String(200), nullable=True),
        sa.Column('payload', sa.Text(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('nfc_write_tasks')
    op.drop_table('import_tasks')
    op.drop_table('activity_logs')
    op.drop_table('sync_logs')
    op.drop_table('logical_shelf_books')
    op.drop_table('book_metadata')
    op.drop_table('physical_logical_mappings')
    op.drop_table('logical_shelves')
    op.drop_table('physical_shelves')
