from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.models import BookMetadata, BookStatus
from app.schemas import (
    ShelfBooksResponse, BookInShelf,
    BookAddToShelfRequest, BookAddToShelfResponse,
    ShelfInfoResponse,
)
from app.api.shelves import crud


def list_shelves(db, search=None, sort_by="created_at", order="desc"):
    shelves = crud.get_active_shelves(db, search=search, sort_by=sort_by, order=order)
    if not shelves:
        return []
    shelf_ids = [s.logical_shelf_id for s in shelves]
    book_counts = crud.get_book_count_per_shelf(db, shelf_ids)
    physical_mappings = crud.get_physical_mappings_for_shelves(db, shelf_ids)
    results = []
    for shelf in shelves:
        sid = shelf.logical_shelf_id
        physical = physical_mappings.get(sid)
        results.append(ShelfInfoResponse(
            logical_shelf_id=sid, shelf_name=shelf.shelf_name,
            description=shelf.description, book_count=book_counts.get(sid, 0),
            physical_location=physical["location_name"] if physical else None,
            physical_code=physical["location_code"] if physical else None,
            created_at=shelf.created_at.isoformat() if shelf.created_at else None,
            updated_at=shelf.updated_at.isoformat() if shelf.updated_at else None,
        ))
    return results


def create_shelf(db, name, description=None):
    existing = crud.get_shelf_by_name(db, name)
    if existing:
        raise HTTPException(status_code=409, detail="Shelf already exists")
    shelf = crud.create_shelf(db, name, description)
    return {"logical_shelf_id": shelf.logical_shelf_id, "shelf_name": shelf.shelf_name, "description": shelf.description}


def get_shelf_detail(db, shelf_id):
    shelf = crud.get_shelf_by_id(db, shelf_id)
    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")
    book_count = crud.get_book_count_per_shelf(db, [shelf_id]).get(shelf_id, 0)
    physical_mappings = crud.get_physical_mappings_for_shelves(db, [shelf_id])
    physical = physical_mappings.get(shelf_id)
    return ShelfInfoResponse(
        logical_shelf_id=shelf.logical_shelf_id, shelf_name=shelf.shelf_name,
        description=shelf.description, book_count=book_count,
        physical_location=physical["location_name"] if physical else None,
        physical_code=physical["location_code"] if physical else None,
        created_at=shelf.created_at.isoformat() if shelf.created_at else None,
        updated_at=shelf.updated_at.isoformat() if shelf.updated_at else None,
    )


def update_shelf(db, shelf_id, name, description=None):
    shelf = crud.get_shelf_by_id(db, shelf_id)
    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")
    if name != shelf.shelf_name:
        existing = crud.get_shelf_by_name(db, name)
        if existing:
            raise HTTPException(status_code=409, detail="Shelf name already used")
    shelf = crud.update_shelf(db, shelf, name, description)
    return {"logical_shelf_id": shelf.logical_shelf_id, "shelf_name": shelf.shelf_name}


def delete_shelf(db, shelf_id):
    shelf = crud.get_shelf_by_id(db, shelf_id)
    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")
    if not crud.check_shelf_empty(db, shelf_id):
        raise HTTPException(status_code=400, detail="Shelf not empty")
    name = crud.soft_delete_shelf(db, shelf)
    return {"message": f"Shelf {name} deleted"}


def get_shelf_books(db, shelf_id, sort_by="sort_order", order="asc"):
    shelf = crud.get_shelf_by_id(db, shelf_id)
    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")
    items = crud.get_shelf_books(db, shelf_id, sort_by=sort_by, order=order)
    books = []
    for shelf_book, book in items:
        books.append(BookInShelf(
            book_id=book.book_id, isbn=book.isbn, title=book.title,
            author=book.author, publisher=book.publisher,
            publish_date=book.publish_date, cover_url=book.cover_url,
            rating=book.rating, source=book.source or "manual",
            sort_order=shelf_book.sort_order,
            added_at=shelf_book.added_at.isoformat() if shelf_book.added_at else None,
            shelf_name=shelf.shelf_name,
            
        ))
    # ★ Bug 修复 (pre-existing): Schema 字段名为 logical_shelf_id, 而非 shelf_id
    # 旧代码传 shelf_id= 会触发 pydantic ValidationError (缺少 logical_shelf_id 必填字段)
    return ShelfBooksResponse(
        logical_shelf_id=shelf_id,
        shelf_name=shelf.shelf_name,
        description=shelf.description,
        books=books,
        total_count=len(books),
    )


def add_book_to_shelf(db, shelf_id, book_id, sort_order=0, note=None):
    shelf = crud.get_shelf_by_id(db, shelf_id)
    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")
    book = db.query(BookMetadata).filter(BookMetadata.book_id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    existing = crud.find_existing_shelf_book(db, shelf_id, book_id)
    if existing:
        raise HTTPException(status_code=409, detail="Book already in shelf")
    deleted = crud.find_existing_shelf_book(db, shelf_id, book_id, include_deleted=True)
    if deleted and deleted.status != "in_shelf":
        deleted.note = note
        deleted.updated_at = datetime.now(timezone.utc)
        db.commit()
        return BookAddToShelfResponse(
            success=True, message="Book restored to shelf", shelf_book_id=deleted.id,
        )
    shelf_book = crud.add_book_to_shelf(db, shelf_id, book_id, sort_order, note)
    return BookAddToShelfResponse(
        success=True, message="Book added to shelf", shelf_book_id=shelf_book.id,
    )


def remove_book_from_shelf(db, shelf_id, book_id):
    shelf_book = crud.get_shelf_book_by_book_id(db, shelf_id, book_id)
    if not shelf_book:
        raise HTTPException(status_code=404, detail="Book not in shelf")
    crud.remove_book_from_shelf(db, shelf_book)
    return {"message": "Book removed from shelf"}


def move_book(db, shelf_id, book_id, target_shelf_id, position=None):
    shelf_book = crud.get_shelf_book_by_book_id(db, shelf_id, book_id)
    if not shelf_book:
        raise HTTPException(status_code=404, detail="Book not in source shelf")
    target_shelf = crud.get_shelf_by_id(db, target_shelf_id)
    if not target_shelf:
        raise HTTPException(status_code=404, detail="Target shelf not found")
    existing = crud.find_existing_shelf_book(db, target_shelf_id, book_id)
    if existing:
        raise HTTPException(status_code=409, detail="Book already in target shelf")
    crud.move_book_to_shelf(db, shelf_book, target_shelf_id, position)
    return {"message": "Book moved", "target_shelf_id": target_shelf_id}


def update_sort_order(db, shelf_id, book_id, sort_order):
    shelf_book = crud.get_shelf_book_by_book_id(db, shelf_id, book_id)
    if not shelf_book:
        raise HTTPException(status_code=404, detail="Book not in shelf")
    crud.update_book_sort_order(db, shelf_book, sort_order)
    return {"message": "Sort updated"}


def get_book_by_index(db, shelf_id, index):
    shelf = crud.get_shelf_by_id(db, shelf_id)
    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")
    result = crud.get_shelf_book_by_index(db, shelf_id, index)
    if not result:
        raise HTTPException(status_code=404, detail=f"No book at index {index}")
    shelf_book, book = result
    return BookInShelf(
        book_id=book.book_id, isbn=book.isbn, title=book.title,
        author=book.author, publisher=book.publisher,
        publish_date=book.publish_date, cover_url=book.cover_url,
        rating=book.rating, source=book.source or "manual",
        sort_order=shelf_book.sort_order,
        added_at=shelf_book.added_at.isoformat() if shelf_book.added_at else None,
        shelf_name=shelf.shelf_name,
        
    )


def update_book_by_index(db, shelf_id, index, position=None, sort_order=None):
    shelf = crud.get_shelf_by_id(db, shelf_id)
    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")
    result = crud.get_shelf_book_by_index(db, shelf_id, index)
    if not result:
        raise HTTPException(status_code=404, detail=f"No book at index {index}")
    shelf_book, _ = result
    crud.update_book_in_shelf(db, shelf_book, position=position, sort_order=sort_order)
    return {"message": "Updated"}


def delete_book_by_index(db, shelf_id, index):
    shelf = crud.get_shelf_by_id(db, shelf_id)
    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")
    result = crud.get_shelf_book_by_index(db, shelf_id, index)
    if not result:
        raise HTTPException(status_code=404, detail=f"No book at index {index}")
    shelf_book, book = result
    crud.remove_book_from_shelf(db, shelf_book)
    return {"message": f"Book {book.title} removed from shelf"}