from __future__ import annotations

from pathlib import Path

from .database import connect


def delete_local_account_data(db_path: str | Path, *, user_id: str) -> dict[str, int]:
    """Delete legacy/local rows that are keyed by an authenticated Supabase UUID."""
    deleted: dict[str, int] = {}
    with connect(db_path) as connection:
        tables = {
            str(row["name"])
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }

        def execute_if_present(table: str, sql: str, parameters: tuple[object, ...]) -> None:
            if table not in tables:
                return
            cursor = connection.execute(sql, parameters)
            deleted[table] = cursor.rowcount

        execute_if_present(
            "daily_pick_served_history",
            "DELETE FROM daily_pick_served_history WHERE owner_id = ?",
            (user_id,),
        )
        execute_if_present(
            "daily_pick_rounds",
            "DELETE FROM daily_pick_rounds WHERE owner_id = ?",
            (user_id,),
        )
        if "restaurant_list_items" in tables and "restaurant_lists" in tables:
            execute_if_present(
                "restaurant_list_items",
                """
                DELETE FROM restaurant_list_items
                WHERE list_id IN (SELECT id FROM restaurant_lists WHERE owner_id = ?)
                """,
                (user_id,),
            )
        execute_if_present(
            "restaurant_lists",
            "DELETE FROM restaurant_lists WHERE owner_id = ?",
            (user_id,),
        )
        execute_if_present(
            "restaurant_visits",
            "DELETE FROM restaurant_visits WHERE owner_id = ?",
            (user_id,),
        )
        execute_if_present(
            "user_profiles",
            "DELETE FROM user_profiles WHERE user_id = ?",
            (user_id,),
        )
        execute_if_present(
            "community_recommendations",
            "DELETE FROM community_recommendations WHERE user_subject_id = ?",
            (user_id,),
        )
        connection.commit()
    return deleted
