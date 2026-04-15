from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbDep
from app.api.schemas import (
    AuthLoginIn,
    AuthRegisterIn,
    TokenOut,
    UserOut,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut)
def register(data: AuthRegisterIn, db: DbDep) -> TokenOut:
    existing = db.scalar(select(User).where(User.email == data.email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=user.id)
    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut)
def login(data: AuthLoginIn, db: DbDep) -> TokenOut:
    user = db.scalar(select(User).where(User.email == data.email))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(subject=user.id)
    return TokenOut(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUserDep) -> UserOut:
    return UserOut.model_validate(current_user, from_attributes=True)

