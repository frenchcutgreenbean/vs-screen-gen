// ==UserScript==
// @name        SlowPics PNG
// @namespace   Violentmonkey Scripts
// @match       https://slow.pics/c/*
// @require     https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @grant       GM.xmlHttpRequest
// @version     1.0
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
  downloadButton.setAttribute("class", "btn btn-secondary btn-download mr-2");
  downloadButton.prepend(icon);
  let nav_item = document.querySelector(".footer-position");
  let brother = nav_item.children[3];
  brother.insertAdjacentElement("afterend", downloadButton);
  downloadButton.addEventListener("click", getButtonFunction);

  let comps = [];
  document.querySelectorAll("[id^=dropdown-comparison-]").forEach((comp) => {
    comps.push(comp.href);
  });

  if (debug) console.log(comps);

  let sources = [];
  let source_children = [...document.getElementById("preload-images").children];
  source_children.forEach((img) => {
    sources.push(img.alt);
  });
  if (debug) console.log(sources);

  async function getButtonFunction() {
    if (downloadButton.textContent == "Download as PNG") {
      await gatherImages();
    } else {
      downloadButton.textContent = "Converting...";
      await gatherImages();
      downloadButton.textContent = "Download as PNG";
    }
  }

  async function gatherImages() {
    const zip = new JSZip();
    const title = document.querySelector("title").innerText;
    const cleanTitle = title.replace(/[^a-zA-Z0-9_.-]/g, "_");
    for (const comp of comps) {
      const compHTML = await fetchComparisonHTML(comp);
      const compImages = [
        ...compHTML.getElementById("preload-images").children,
      ];
      const compTitle = compHTML.getElementById("comparisons").title;

      const promises = compImages.map(async (img, index) => {
        const imgUrl = img.src;
        const pngBlob = await convertToBlob(imgUrl);
        const cleanSource = sources[index].replace(/[^a-zA-Z0-9_.-]/g, "_");
        if (debug) console.log(pngBlob);
        if (debug) console.log(`${compTitle}_${cleanSource}.png`);
        zip.file(`${compTitle}_${cleanSource}.png`, pngBlob);
      });

      await Promise.all(promises);
    }
    downloadButton.textContent = "Preparing...";
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(zipBlob);
    downloadLink.download = `${cleanTitle}.zip`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
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

  function convertToBlob(imgUrl) {
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
