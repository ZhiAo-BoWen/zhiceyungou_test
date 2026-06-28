import config
from services.env_store import read_env_value, update_env_file


def get_admin_password() -> str:
    return (config.ADMIN_PASSWORD or read_env_value("ADMIN_PASSWORD", "")).strip()


def verify_admin_password(password: str) -> bool:
    stored = get_admin_password()
    if not stored:
        return False
    return (password or "").strip() == stored


def change_admin_password(current_password: str, new_password: str) -> None:
    current_password = (current_password or "").strip()
    new_password = (new_password or "").strip()
    if not verify_admin_password(current_password):
        raise ValueError("当前密码不正确")
    if len(new_password) < 6:
        raise ValueError("新密码至少 6 位")
    update_env_file("ADMIN_PASSWORD", new_password)
    config.ADMIN_PASSWORD = new_password
