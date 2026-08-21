from pathlib import Path
import json
import requests

API_URL = "https://example.com/api/upload"
USER_ID = "your-user-id"
ZIP_DIR = Path("./zips")
OUT_FILE = Path("./task_results.json")

results = []

for zip_path in ZIP_DIR.glob("*.zip"):
    print(f"Uploading {zip_path.name}...")

    try:
        with zip_path.open("rb") as f:
            files = {
                "file": (zip_path.name, f, "application/zip")
            }

            data = {
                "userId": USER_ID
            }

            response = requests.post(
                API_URL,
                files=files,
                data=data,
                timeout=120,
            )

        response.raise_for_status()
        payload = response.json()

        task_id = payload["taskId"]

        results.append({
            "zipName": zip_path.name,
            "taskId": task_id,
        })

    except Exception as e:
        results.append({
            "zipName": zip_path.name,
            "taskId": None,
            "error": str(e),
        })

with OUT_FILE.open("w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("Done.")
print(results)