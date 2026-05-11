from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserDep, DbDep
from app.api.schemas import ProjectCreateIn, ProjectOut, ProjectUpdateIn
from app.db.models import Project


router = APIRouter(prefix="/projects", tags=["projects"])


def get_or_create_default_project(db: Session, user_id: str) -> Project:
    project = db.scalar(
        select(Project).where(Project.user_id == user_id).order_by(Project.created_at.asc()).limit(1)
    )
    if project:
        return project

    project = Project(user_id=user_id, name="General")
    db.add(project)
    db.flush()
    return project


@router.get("", response_model=list[ProjectOut])
def list_projects(db: DbDep, current_user: CurrentUserDep) -> list[ProjectOut]:
    get_or_create_default_project(db, current_user.id)
    db.commit()

    rows = db.scalars(
        select(Project).where(Project.user_id == current_user.id).order_by(Project.updated_at.desc())
    ).all()
    return [ProjectOut.model_validate(project, from_attributes=True) for project in rows]


@router.post("", response_model=ProjectOut)
def create_project(data: ProjectCreateIn, db: DbDep, current_user: CurrentUserDep) -> ProjectOut:
    project = Project(user_id=current_user.id, name=data.name.strip())
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(project, from_attributes=True)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: DbDep, current_user: CurrentUserDep) -> ProjectOut:
    project = db.get(Project, project_id)
    if project is None or project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return ProjectOut.model_validate(project, from_attributes=True)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str, data: ProjectUpdateIn, db: DbDep, current_user: CurrentUserDep
) -> ProjectOut:
    project = db.get(Project, project_id)
    if project is None or project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project.name = data.name.strip()
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(project, from_attributes=True)


@router.delete("/{project_id}")
def delete_project(project_id: str, db: DbDep, current_user: CurrentUserDep) -> Response:
    project = db.get(Project, project_id)
    if project is None or project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    remaining = db.scalar(
        select(Project.id).where(Project.user_id == current_user.id, Project.id != project_id).limit(1)
    )
    if remaining is None:
        raise HTTPException(status_code=400, detail="Cannot delete the only project")

    db.delete(project)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
