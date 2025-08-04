// ==UserScript==
// @name        SlowPics Rehost
// @namespace   Violentmonkey Scripts
// @match       https://slow.pics/c/*
// @grant       GM.xmlHttpRequest
// @grant       GM.setClipboard
// @version     1.5
// @author      L4G
// @description Get All Images from slow.pics, rehost to ptpimg and then output comparison bbcode
// ==/UserScript==

/*
Updated by dantayy. OG: from here https://github.com/L4GSP1KE/Userscripts ty L4G!
Since URL uploads don't work properly on PTPIMG we have to manually fetch and upload them.
So speed is reliant on your upload speed.
*/

(function () {
  "use strict";

  const PTPIMG_API_KEY = "";

  const debug = false; // turn this to true to log updates to console.

  const convertButton = document.createElement("button");
  convertButton.textContent = "Convert Comparison";
  convertButton.setAttribute("class", "btn btn-success me-2");
  convertButton.setAttribute("type", "button");
  let nav_item = document.querySelector(".footer-position");
  let existingDownloadBtn = nav_item.querySelector(".btn-download");
  existingDownloadBtn.insertAdjacentElement("afterend", convertButton);
  convertButton.addEventListener("click", getButtonFunction);

  let comps = [];
  let sources = [];
  
  // Use the collection data that's available on the page
  if (typeof collection !== 'undefined' && collection.comparisons) {
    // Get source names from the first comparison
    if (collection.comparisons.length > 0) {
      collection.comparisons[0].images.forEach((img) => {
        sources.push(img.name);
      });
    }
    
    // Store comparison data directly
    comps = collection.comparisons;
  } else {
    // Fallback: get from preview section
    document.querySelectorAll("#preview a").forEach((comp) => {
      comps.push(comp.href);
    });
    
    let preview_images = document.querySelectorAll("#preview img");
    preview_images.forEach((img) => {
      sources.push(img.alt);
    });
  }

  let images = [];
  async function getButtonFunction() {
    if (convertButton.textContent == "Show Comparison") {
      showComparison();
    } else if (convertButton.textContent == "Convert Comparison") {
      convertButton.textContent = "Converting...";
      convertButton.disabled = true;
      try {
        await generateComparison();
        showComparison();
      } catch (error) {
        console.error('Error generating comparison:', error);
        convertButton.textContent = "✗ Error occurred";
        setTimeout(() => {
          convertButton.textContent = "Convert Comparison";
          convertButton.disabled = false;
        }, 3000);
      }
    }
    // Ignore clicks while processing
  }

  async function generateComparison() {
    const totalComparisons = comps.length;
    
    // Check if we have collection data available (much faster!)
    if (typeof collection !== 'undefined' && collection.comparisons) {
      const cdnBaseUrl = typeof cdnUrl !== 'undefined' ? cdnUrl : "https://i.slow.pics/";
      
      for (let i = 0; i < collection.comparisons.length; i++) {
        const comparison = collection.comparisons[i];
        const compTitle = comparison.name;
        
        // Update button text with progress
        convertButton.textContent = `Processing ${i + 1}/${totalComparisons}: ${compTitle}`;
        
        let beforeLength = images.length;
        
        if (PTPIMG_API_KEY == "") {
          // Just use direct CDN URLs (fastest)
          comparison.images.forEach((img) => {
            images.push(cdnBaseUrl + img.publicFileName);
          });
        } else {
          // Upload to PTPIMG
          const promises = comparison.images.map(async (img, index) => {
            const imgUrl = cdnBaseUrl + img.publicFileName;
            const rehosted = await processImage(imgUrl);
            images[index + beforeLength] = rehosted;
          });
          await Promise.all(promises);
          images.length = beforeLength + comparison.images.length;
        }
      }
    } else {
      // Fallback to old method
      for (let i = 0; i < comps.length; i++) {
        const comp = comps[i];
        convertButton.textContent = `Processing ${i + 1}/${totalComparisons}...`;
        
        const compHTML = await fetchComparisonHTML(comp);
        const compImages = [
          ...compHTML.querySelectorAll("#preview img"),
        ];
        let beforeLength = images.length;
        
        if (PTPIMG_API_KEY == "") {
          compImages.forEach((img) => {
            images.push(img.src);
          });
        } else {
          const promises = compImages.map(async (img, index) => {
            const rehosted = await processImage(img.src);
            images[index + beforeLength] = rehosted;
          });
          await Promise.all(promises);
          images.length = beforeLength + compImages.length;
        }
      }
    }
    
    // Wait for all uploads to complete (only needed for PTPIMG uploads)
    if (PTPIMG_API_KEY !== "") {
      while (images.filter(Boolean).length !== comps.length * sources.length) {
        await delay(1000);
      }
    }
    
    if (debug) console.log(`Images: ${images}`);
    convertButton.textContent = "Show Comparison";
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
            reject(`Error: ${response.status}`);
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
            reject(`Error: ${response.status}`);
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

  function uploadImage(blob) {
    if (debug) console.log(`Uploading to PTPIMG...`);
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file-upload[0]", blob, "image.png");
      formData.append("format", "json");
      formData.append("api_key", PTPIMG_API_KEY);

      GM.xmlHttpRequest({
        method: "POST",
        url: "https://ptpimg.me/upload.php",
        headers: {
          Referer: "https://ptpimg.me/index.php",
        },
        data: formData,
        onload: function (response) {
          if (response.status === 200) {
            let res = JSON.parse(response.responseText);
            if (debug) {
              console.log(
                `Uploaded: ${`https://ptpimg.me/${res[0].code}.${res[0].ext}`}`
              );
            }
            resolve(`https://ptpimg.me/${res[0].code}.${res[0].ext}`);
          } else {
            reject(`Error: ${response.status}`);
          }
        },
        onerror: function (err) {
          reject(err);
        },
      });
    });
  }

  async function processImage(imgUrl) {
    try {
      const blob = await convertToBlob(imgUrl);
      const uploadResponse = await uploadImage(blob);
      return uploadResponse;
    } catch (error) {
      console.error("Error processing image: ", error);
    }
  }

  function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  function showComparison() {
    let comp_bbcode = `[comparison=${sources.join(", ")}]\n${images.join(
      "\n"
    )}\n[/comparison]`;
    console.log(comp_bbcode);
    if (confirm(`Press OK to copy to clipboard \n\n${comp_bbcode}`) == true) {
      GM.setClipboard(comp_bbcode);
      convertButton.textContent = "✓ Copied!";
      setTimeout(() => {
        convertButton.textContent = "Show Comparison";
        convertButton.disabled = false;
      }, 2000);
    } else {
      convertButton.textContent = "Show Comparison";
      convertButton.disabled = false;
    }
  }
})();
