// ==UserScript==
// @name     Instagram content donor for RSS-Bridge
// @version  1
// @include  https://www.instagram.com/*
// @grant    GM.xmlHttpRequest
// @grant    GM.getValue
// @grant    GM.setValue
// ==/UserScript==

const USERNAME_AS_USERID_REGEX = /instagram\.com\/(\d+)/;

async function getConfig(name) {
  let r = localStorage.getItem(name);
  if (r) {
    await GM.setValue(name, r);
    localStorage.removeItem(name);
    return r;
  } else {
    return await GM.getValue(name);
  }
}

async function setConfig(name, value) {
  localStorage.removeItem(name);
  await GM.setValue(name, value);
}

async function getState() {
  return await getConfig("RSSBRIDGE_DONOR_STATE") || 'free';
}

async function setState(state) {
  await setConfig("RSSBRIDGE_DONOR_STATE", state);
}

let ACCESS_TOKEN;
let RSSBRIDGE_ROOT;

function sleep(s) {
  let ms = 1000*s;
  return new Promise(resolve => setTimeout(resolve, ms));
}

function get(url, headers) {
  // TODO: use token as authorization
  return new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method: "GET",
      url,
      headers: headers,
      onload: function(response) {
        if (response.status != 200) {
          reject(response);
        } else {
          resolve(response);
        }
      },
      onerror: reject
    });
  });
}

function post(url, data) {
  // TODO: use token to autohrized
  return new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method: "POST",
      url,
      headers: { "Content-type" : "application/x-www-form-urlencoded" },
      data: data,
      onload: function(response) {
        if (response.status != 200) {
          reject(response);
        } else {
          resolve(response);
        }
      },
      onerror: reject
    });
  });
}

var webProfileInfo;
var webProfileInfoStatus;

if (!unsafeWindow.XMLHttpRequest.prototype.getResponseText) {
  unsafeWindow.XMLHttpRequest.prototype.getResponseText = Object.getOwnPropertyDescriptor(unsafeWindow.XMLHttpRequest.prototype, 'responseText').get;
}
Object.defineProperty(unsafeWindow.XMLHttpRequest.prototype, 'responseText', {
  get: exportFunction(function() {
    var responseText = unsafeWindow.XMLHttpRequest.prototype.getResponseText.call(this);
    if (this.responseURL.startsWith("https://i.instagram.com/api/v1/users/web_profile_info/?username=")) {
      webProfileInfo = responseText;
      webProfileInfoStatus = this.status;
    }
    return responseText;
  }, unsafeWindow),
  enumerable: true,
  configurable: true
});

async function pullInstagramURLToCrawl() {
  try {
    const response = await get(RSSBRIDGE_ROOT + '/index.php?action=pull-job-queue&channel=InstagramBridge&access_token=' + ACCESS_TOKEN);
    return response.responseText;
  } catch (e) {
    console.error(e);
    return '';
  }
}

function is429Error() {
  if (webProfileInfoStatus == 429) return true;
  let c = document.querySelector(".error-container");
  return c && c.innerText.indexOf("Please wait") > -1;
}

async function main() {
  ACCESS_TOKEN = await getConfig('RSSBRIDGE_ACCESS_TOKEN');
  RSSBRIDGE_ROOT = await getConfig('RSSBRIDGE_ROOT');
  const DONOR_STATE = await getState();

  if (!RSSBRIDGE_ROOT) {
    alert("No RSSBRIDGE_ROOT defined");
    return;
  }

  while(!document || !document.querySelector) {
    await sleep(1);
  }


  switch (DONOR_STATE) {
  case 'occupied':
    await sleep(10 + 5 * Math.random()); // give time to fetch webProfileInfo
    for(let i=0; i<30; i++) {
      if (webProfileInfoStatus > 0) break;
      await sleep(1);
    }

    if (is429Error()) {
      // TODO: maybe report, that it must be switched
      await setState('free');
      return;
    }

    try {
      let instagramData;
      let instagramDataStr;
      if (webProfileInfo) {
        instagramDataStr = webProfileInfo;
        instagramData = JSON.parse(webProfileInfo);
      }

      if (instagramDataStr) {
        const username = instagramData.data.user.username;
        const userid = instagramData.data.user.id;
        await post(
          RSSBRIDGE_ROOT + "/?action=set-bridge-cache&bridge=Instagram&key=userid_" + username + '&access_token=' + ACCESS_TOKEN,
          "value=" + encodeURIComponent(userid)
        );
        await post(
          RSSBRIDGE_ROOT + "/?action=set-bridge-cache&bridge=Instagram&key=data_u_" + userid + '&access_token=' + ACCESS_TOKEN,
          "value=" + encodeURIComponent(instagramDataStr)
        );
      } else {
        // TODO: report, no data
      }

    } catch(e) {
      console.error("DONOR ERROR: error while posting cache", e);
      await sleep(10);
      location.reload();
      return;
    }

    await setState('free');
    window.scrollTo({"top": 500, "left": 0, "behavior": "smooth"});
    await sleep(1 + 3 * Math.random());
    document.elementFromPoint(400, 100).click();
    await sleep(3 + 3 * Math.random());

  case "free":
    let url = '';
    while(!url) {
      url = await pullInstagramURLToCrawl();
      await sleep(3);
    }

    let matches = url.match(USERNAME_AS_USERID_REGEX);
    if (matches) {
      const user_id = matches[1];
      try {
        const response = await get("https://i.instagram.com/api/v1/users/" + user_id + "/info/", {'X-IG-App-ID': '936619743392459'});
        const json = JSON.parse(response.responseText);
        url = "https://www.instagram.com/" + json.user.username;
      } catch (e) {
        // TODO: this user may not exist
      }
    }

    await setState('occupied');
    location.href = url;

    break;

  default:
    alert("Unknown state: " + DONOR_STATE);
  };
};

main();
