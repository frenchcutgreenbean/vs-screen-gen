import requests
import os
import shutil
from dotenv import load_dotenv

load_dotenv()

ptpimg_api = os.getenv("PTPIMG_API")

payload = {
    "format": "json",
    "api_key": ptpimg_api,  # API key obtained from inspecting element on the upload page.
}
headers = {"referer": "https://ptpimg.me/index.php"}
upload_url = "https://ptpimg.me/upload.php"
folder_path = "Screenshots"  # Replace with your folder path
backup_path = r"Screenshots\Backup"

links = []

# Iterate through all files in the folder
for filename in os.listdir(folder_path):
    if filename.endswith(".png"):
        file_path = os.path.join(folder_path, filename)
        backup = os.path.join(backup_path, filename)

        try:
            with open(file_path, "rb") as file:
                files = {"file-upload[0]": file}

                response = requests.post(
                    upload_url, headers=headers, data=payload, files=files
                )
                response.raise_for_status()  # Raise an exception for HTTP errors
                res = response.json()
                link = f"https://ptpimg.me/{res[0]['code']}.{res[0]['ext']}"
                links.append(link)

            # Move file to backup folder only if upload was successful
            shutil.move(file_path, backup)

            print(f"Uploaded {filename} successfully.")
        except requests.exceptions.RequestException as e:
            print(f"Failed to upload {filename}: {e}")
        except Exception as e:
            print(f"Error processing {filename}: {e}")

comp = f"""
[comparison=set,these,manually]
{"\n".join(links)}
[/comparison]
"""
print(comp)
