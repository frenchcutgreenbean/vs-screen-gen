// ==UserScript==
// @name        SlowPics PNG
// @namespace   Violentmonkey Scripts
// @match       https://slow.pics/c/*
// @require     https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @grant       GM.xmlHttpRequest
// @version     1.4
// @author      dantayy
// @description Get All Images from slow.pics, convert to PNG zip and download.
// ==/UserScript==

(function () {
  "use strict";
  const debug = false; // turn this to true to log updates to console.

  const downloadButton = document.createElement("a");
  const icon = document.createElement("i");
  icon.classList.add("fa", "fa-download");
  downloadButton.textContent = " Download as PNG";
  downloadButton.setAttribute("class", "btn btn-secondary btn-download me-2");
  downloadButton.prepend(icon);
  let nav_item = document.querySelector(".footer-position");
  let existingDownloadBtn = nav_item.querySelector(".btn-download");
  existingDownloadBtn.insertAdjacentElement("afterend", downloadButton);
  downloadButton.addEventListener("click", getButtonFunction);

  let comps = [];
  let sources = [];

  // Use the collection data that's available on the page
  if (typeof collection !== 'undefined' && collection.comparisons) {
    // Store comparison data directly
    comps = collection.comparisons;
  } else {
    // Fallback: get from preview section
    document.querySelectorAll("#preview a").forEach((comp) => {
      comps.push(comp.href);
    });
  }

  if (debug) console.log(comps);
  if (debug) console.log(sources);

  async function getButtonFunction() {
    if (downloadButton.textContent.trim() === "Download as PNG") {
      await gatherImages();
    } else {
      // Already processing, ignore additional clicks
      return;
    }
  }

  async function gatherImages() {
    const zip = new JSZip();
    let title = document.querySelector("title").innerText;
    title = title.replace(' | Slowpoke Pics', '');
    const cleanTitle = title.replace(/[^a-zA-Z0-9_.-]/g, "_");

    try {
      // Check if we have collection data available
      if (typeof collection !== 'undefined' && collection.comparisons) {
        // Use the collection data - much more efficient!
        const cdnBaseUrl = typeof cdnUrl !== 'undefined' ? cdnUrl : "https://i.slow.pics/";
        const totalComparisons = collection.comparisons.length;

        for (let i = 0; i < collection.comparisons.length; i++) {
          const comparison = collection.comparisons[i];

          // Update button text with progress
          downloadButton.textContent = `Processing ${i + 1}/${totalComparisons}...`;

          const promises = comparison.images.map(async (img, index) => {
            const imgUrl = cdnBaseUrl + img.publicFileName;
            const progressText = `Processing ${i + 1}/${totalComparisons}`;
            const pngBlob = await convertToBlob(imgUrl, progressText);
            
            const letter = String.fromCharCode(97 + index); // 97 is 'a' in ASCII
            
            if (debug) console.log(pngBlob);
            if (debug) console.log(`${i + 1}${letter}.png`);

            zip.file(`${i + 1}${letter}.png`, pngBlob, {
              compression: "STORE",
            });
          });

          await Promise.all(promises);
        }
      } else {
        // Fallback to the old method
        const totalComparisons = comps.length;

        for (let i = 0; i < comps.length; i++) {
          const comp = comps[i];

          // Update button text with progress
          downloadButton.textContent = `Processing ${i + 1}/${totalComparisons}...`;

          const compHTML = await fetchComparisonHTML(comp);

          const compImages = [
            ...compHTML.querySelectorAll("#preview img"),
          ];

          const compTitle = (i + 1).toString();

          const promises = compImages.map(async (img, index) => {
            const imgUrl = img.src;
            const progressText = `Processing ${i + 1}/${totalComparisons}...`;
            const pngBlob = await convertToBlob(imgUrl, progressText);
            const cleanSource = sources[index] ? sources[index].replace(/[^a-zA-Z0-9_.-]/g, "_") : `source_${index}`;
            if (debug) console.log(pngBlob);
            if (debug) console.log(`${compTitle}_${cleanSource}.png`);

            // Add to ZIP with compression level 1 (fastest)
            zip.file(`${i + 1}_${cleanTitle}_${cleanSource}.png`, pngBlob, {
              compression: "STORE",
            });
          });

          await Promise.all(promises);
        }
      }

      downloadButton.textContent = "Preparing ZIP...";

      // Generate ZIP with progress callback and optimized settings
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "STORE",
        streamFiles: true  // Process files as streams to reduce memory usage
      }, function updateCallback(metadata) {
        // Show progress during ZIP generation
        const percent = Math.round(metadata.percent);
        downloadButton.textContent = `Preparing ZIP... ${percent}%`;
      });

      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(zipBlob);
      downloadLink.download = `${cleanTitle}.zip`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Show success message briefly
      downloadButton.textContent = "✓ Downloaded!";
      setTimeout(() => {
        downloadButton.textContent = " Download as PNG";
      }, 2000);

    } catch (error) {
      console.error('Error downloading images:', error);
      downloadButton.textContent = "✗ Error occurred";
      setTimeout(() => {
        downloadButton.textContent = " Download as PNG";
      }, 3000);
    }
  }

  function fetchComparisonHTML(url) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url: url,
        onload: function (response) {
          if (response.status === 200) {
            const parser = new DOMParser();
            const compHTML = parser.parseFromString(
              response.responseText,
              "text/html"
            );
            resolve(compHTML);
          } else {
            reject(new Error(`${response.status}`));
          }
        },
        onerror: function (err) {
          reject(err);
        },
      });
    });
  }

  function convertToBlob(imgUrl, progressText = "") {
    return new Promise((resolve, reject) => {
      if (debug) console.log(`Converting ${imgUrl} to Blob`);
      GM.xmlHttpRequest({
        method: "GET",
        url: imgUrl,
        responseType: "blob",
        onload: async function (response) {
          if (response.status === 200) {
            const blob = response.response;
            if (blob.type === "image/webp") {
              if (debug) console.log(`Converting WebP to PNG for ${imgUrl}`);
              if (progressText) {
                downloadButton.textContent = `${progressText} (Converting WebP)`;
              }
              try {
                const pngBlob = await convertWebPToPNG(blob);
                resolve(pngBlob);
              } catch (error) {
                reject(error);
              }
            } else {
              resolve(blob);
            }
          } else {
            reject(new Error(`${response.status}`));
          }
        },
        onerror: function (err) {
          reject(err);
        },
      });
    });
  }

  function convertWebPToPNG(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(function (pngBlob) {
            resolve(pngBlob);
          }, "image/png");
        };
        img.src = event.target.result;
      };
      reader.onerror = function (err) {
        reject(err);
      };
      reader.readAsDataURL(blob);
    });
  }
})();
