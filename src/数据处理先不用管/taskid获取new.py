import json
from pathlib import Path

import requests
import urllib3


API_URL = "https://your-api-url"
ZIP_DIR = r"D:\your-zip-folder"
USER_ID = "your-user-id"
OUTPUT_JSON = "task_results.json"

FILE_FIELD = "file"
TASK_ID_FIELD = "taskId"

# If your API has an internal/self-signed HTTPS certificate, keep this False.
VERIFY_SSL = False


def main():
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    zip_dir = Path(ZIP_DIR)
    zip_files = sorted(
        file
        for file in zip_dir.iterdir()
        if file.is_file() and file.suffix.lower() == ".zip"
    )

    results = []

    for index, zip_file in enumerate(zip_files, start=1):
        print(f"[{index}/{len(zip_files)}] uploading {zip_file.name}")

        item = {
            "zipName": zip_file.name,
            "taskId": None,
            "success": False,
        }

        try:
            with zip_file.open("rb") as f:
                response = requests.post(
                    API_URL,
                    params={"userId": USER_ID},
                    files={FILE_FIELD: (zip_file.name, f, "application/zip")},
                    verify=VERIFY_SSL,
                    timeout=120,
                )

            item["statusCode"] = response.status_code

            if response.status_code != 200:
                item["error"] = response.text
                results.append(item)
                continue

            data = response.json()
            item["response"] = data
            item["taskId"] = data.get(TASK_ID_FIELD)
            item["success"] = item["taskId"] is not None

            if item["taskId"] is None:
                item["error"] = f"response has no {TASK_ID_FIELD}"

        except Exception as e:
            item["error"] = str(e)

        results.append(item)

    output = {
        "total": len(results),
        "successCount": sum(1 for item in results if item["success"]),
        "failureCount": sum(1 for item in results if not item["success"]),
        "results": results,
    }

    Path(OUTPUT_JSON).write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"done, saved to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
