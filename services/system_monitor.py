import os

import psutil


def get_system_stats() -> dict:
    cpu_percent = psutil.cpu_percent(interval=0.5)
    memory = psutil.virtual_memory()
    disk_path = os.environ.get("SystemDrive", "C:") + "\\"
    disk = psutil.disk_usage(disk_path)

    return {
        "cpu": {
            "percent": cpu_percent,
            "cores": psutil.cpu_count(logical=True) or 0,
        },
        "memory": {
            "total_gb": round(memory.total / (1024**3), 1),
            "used_gb": round(memory.used / (1024**3), 1),
            "percent": memory.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024**3), 1),
            "used_gb": round(disk.used / (1024**3), 1),
            "percent": disk.percent,
        },
    }
