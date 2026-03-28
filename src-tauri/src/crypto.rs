use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;

pub struct Crypto {
    key: [u8; 32],
}

impl Crypto {
    pub fn new(master_password: &str) -> Self {
        // Use a valid 16-byte Base64 encoded salt
        let salt = SaltString::from_b64("U29tZVN0YXRpY1NhbHQxMg").unwrap(); 
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(master_password.as_bytes(), &salt)
            .expect("Failed to hash master password");
        
        let binding = password_hash.hash.expect("Hash missing");
        let hash_bytes = binding.as_bytes();
        let mut key = [0u8; 32];
        key.copy_from_slice(&hash_bytes[0..32]);

        Self { key }
    }

    pub fn encrypt(&self, plaintext: &str) -> String {
        let cipher = Aes256Gcm::new((&self.key).into());
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .expect("Encryption failed");

        let mut combined = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);

        general_purpose::STANDARD.encode(combined)
    }

    pub fn decrypt(&self, encoded: &str) -> Option<String> {
        let combined = general_purpose::STANDARD.decode(encoded).ok()?;
        if combined.len() < 12 {
            return None;
        }

        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        let cipher = Aes256Gcm::new((&self.key).into());

        let plaintext = cipher.decrypt(nonce, ciphertext).ok()?;
        String::from_utf8(plaintext).ok()
    }
}
