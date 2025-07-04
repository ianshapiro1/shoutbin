document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("send");
  const textarea = document.getElementById("message");
  const result = document.getElementById("result");
  const charCount = document.getElementById("char-count");

  window.addEventListener("load", () => {
    //clear text
    const input = document.querySelector("textarea#message");
    if (input) input.value = "";
  });
  
  //check webcrypto support
  if (window.crypto?.subtle) {
    sendBtn.disabled = false;
  } else {
    document.getElementById("result").textContent =
      "Your browser doesn't support secure encryption.";
  }

  //character limit
  textarea.addEventListener("input", () => {
    charCount.textContent = `${textarea.value.length} / 100000`;
  });

  //passphrase glyph handler
  document.getElementById("toggle-pass").addEventListener("click", () => {
    const passInput = document.getElementById("passphrase");
    const eyeIcon = document.getElementById("eye-icon");
    const isHidden = passInput.type === "password";

    // Prevent accidental password exposure
    if (!isHidden) {
      // Auto-hide password after 30 seconds if left visible
      setTimeout(() => {
        if (passInput.type === "text") {
          passInput.type = "password";
          eyeIcon.src = "/glyphs/invisible.png";
          eyeIcon.alt = "Show";
        }
      }, 30000);
    }

    passInput.type = isHidden ? "text" : "password";
    eyeIcon.src = `/glyphs/${isHidden ? "visible" : "invisible"}.png`;
    eyeIcon.alt = isHidden ? "Hide" : "Show";
  });

  //click handler
  document.getElementById("send").addEventListener("click", async () => {
    const message = textarea.value;
    const passphrase = document.getElementById("passphrase").value.trim();
    const expiry = parseInt(document.getElementById("expiry").value, 10);

    //hide link box
    result.style.display = "none";

    if (!message) {
      result.textContent = "Message cannot be empty.";
      return;
    }
    if (message.length > 100000) {
      result.textContent = "Message exceeds 100000 character limit.";
      return;
    }
    if (passphrase.length > 128) {
      result.textContent = "Passphrase must be less than 128 characters.";
      return;
    }

    try {
      let encryptionResult;
      if (passphrase) {
        encryptionResult = await encryptWithPassphrase(message, passphrase);
      } else {
        encryptionResult = await encrypt(message);
      }

      const { ciphertext, key, iv, salt } = encryptionResult;
      const body = { message: ciphertext, iv, expiry };

      if (salt) body.salt = salt;

      const response = await fetch("/api/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        result.textContent = "Failed to send message.";
        return;
      }

      const data = await response.json();

      //display link box
      result.style.display = "block";

      //clear previous result
      while (result.firstChild) {
        result.firstChild.remove();
      }

      if (passphrase) {
        const link = document.createElement("a");
        link.href = `${location.origin}${data.url}`;
        link.target = "_blank";
        link.textContent = `${location.origin}${data.url}`;
        result.appendChild(link);
      } else {
        const fullUrl = `${location.origin}${data.url}#k=${encodeURIComponent(key)}`;
        const link = document.createElement("a");
        link.href = fullUrl;
        link.target = "_blank";
        link.textContent = fullUrl;
        result.appendChild(link);
      }
    } catch (err) {
      result.textContent = "Encryption or network error occurred.";
      console.error(err);
    }
  });
});

//conversion helpers
function uint8ArrayToBase64(u8) {
  return btoa(String.fromCharCode(...u8));
}

function uint8ArrayToBase64url(u8) {
  const base64 = btoa(String.fromCharCode(...u8));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

//encrypt
async function encrypt(plaintext) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const rawKey = await crypto.subtle.exportKey("raw", key);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );

  return {
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    key: uint8ArrayToBase64url(new Uint8Array(rawKey)),
    iv: uint8ArrayToBase64url(iv),
  };
}

//encrypt with passphrase
async function encryptWithPassphrase(plaintext, passphrase) {
  try {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(plaintext),
    );

    const result = {
      ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
      key: null, // no key in URL
      iv: uint8ArrayToBase64url(iv),
      salt: uint8ArrayToBase64url(salt),
    };

    // Clean up sensitive data from memory
    iv.fill(0);
    salt.fill(0);
    if (typeof plaintext === "string") {
      plaintext = "0".repeat(plaintext.length);
    }
    if (typeof passphrase === "string") {
      passphrase = "0".repeat(passphrase.length);
    }

    return result;
  } catch (error) {
    // Clean up on error
    if (typeof plaintext === "string") {
      plaintext = "0".repeat(plaintext.length);
    }
    if (typeof passphrase === "string") {
      passphrase = "0".repeat(passphrase.length);
    }
    throw error;
  }
}
