package com.synderis.metricsbridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * Secure user database with password hashing and file persistence
 */
public class UserDatabase {
    private final Map<String, User> users = new ConcurrentHashMap<>();
    private final ReadWriteLock lock = new ReentrantReadWriteLock();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Path databaseFile;
    private final SecureRandom secureRandom = new SecureRandom();
    
    public UserDatabase(String databasePath) {
        this.databaseFile = Paths.get(databasePath);
        loadUsers();
    }
    
    /**
     * Create a new user account
     */
    public boolean createUser(String username, String password, boolean isAdmin) {
        if (username == null || username.trim().isEmpty() || 
            password == null || password.trim().isEmpty()) {
            return false;
        }
        
        username = username.trim().toLowerCase();
        
        lock.writeLock().lock();
        try {
            if (users.containsKey(username)) {
                return false; // User already exists
            }
            
            String salt = generateSalt();
            String hashedPassword = hashPassword(password, salt);
            
            User user = new User(username, hashedPassword, salt, isAdmin, System.currentTimeMillis());
            users.put(username, user);
            
            saveUsers();
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }
    
    /**
     * Authenticate a user with username and password
     */
    public boolean authenticateUser(String username, String password) {
        if (username == null || password == null) {
            return false;
        }
        
        username = username.trim().toLowerCase();
        
        lock.readLock().lock();
        try {
            User user = users.get(username);
            if (user == null) {
                return false;
            }
            
            String hashedPassword = hashPassword(password, user.salt);
            return hashedPassword.equals(user.hashedPassword);
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Get user information
     */
    public User getUser(String username) {
        if (username == null) {
            return null;
        }
        
        username = username.trim().toLowerCase();
        
        lock.readLock().lock();
        try {
            return users.get(username);
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Check if user is admin
     */
    public boolean isAdmin(String username) {
        User user = getUser(username);
        return user != null && user.isAdmin;
    }
    
    /**
     * Update user password
     */
    public boolean updatePassword(String username, String oldPassword, String newPassword) {
        if (username == null || oldPassword == null || newPassword == null ||
            newPassword.trim().isEmpty()) {
            return false;
        }
        
        username = username.trim().toLowerCase();
        
        lock.writeLock().lock();
        try {
            User user = users.get(username);
            if (user == null) {
                return false;
            }
            
            // Verify old password
            String hashedOldPassword = hashPassword(oldPassword, user.salt);
            if (!hashedOldPassword.equals(user.hashedPassword)) {
                return false;
            }
            
            // Update password
            String newSalt = generateSalt();
            String hashedNewPassword = hashPassword(newPassword, newSalt);
            user.hashedPassword = hashedNewPassword;
            user.salt = newSalt;
            user.lastModified = System.currentTimeMillis();
            
            saveUsers();
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }
    
    /**
     * Delete a user account
     */
    public boolean deleteUser(String username) {
        if (username == null) {
            return false;
        }
        
        username = username.trim().toLowerCase();
        
        lock.writeLock().lock();
        try {
            User removed = users.remove(username);
            if (removed != null) {
                saveUsers();
                return true;
            }
            return false;
        } finally {
            lock.writeLock().unlock();
        }
    }
    
    /**
     * List all users (admin only)
     */
    public Map<String, UserInfo> listUsers() {
        lock.readLock().lock();
        try {
            Map<String, UserInfo> userList = new HashMap<>();
            for (Map.Entry<String, User> entry : users.entrySet()) {
                User user = entry.getValue();
                userList.put(entry.getKey(), new UserInfo(
                    user.username,
                    user.isAdmin,
                    user.createdAt,
                    user.lastModified
                ));
            }
            return userList;
        } finally {
            lock.readLock().unlock();
        }
    }
    
    /**
     * Set admin status for a user
     */
    public boolean setAdminStatus(String username, boolean isAdmin) {
        if (username == null) {
            return false;
        }
        
        username = username.trim().toLowerCase();
        
        lock.writeLock().lock();
        try {
            User user = users.get(username);
            if (user == null) {
                return false;
            }
            
            user.isAdmin = isAdmin;
            user.lastModified = System.currentTimeMillis();
            saveUsers();
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }
    
    /**
     * Update admin status for a user (alias for setAdminStatus)
     */
    public boolean updateUserAdminStatus(String username, boolean isAdmin) {
        return setAdminStatus(username, isAdmin);
    }
    
    /**
     * Check if a user is the original admin account
     */
    public boolean isOriginalAdmin(String username) {
        if (username == null) {
            return false;
        }
        
        // The original admin is always created with username "admin"
        return username.trim().toLowerCase().equals("admin");
    }
    
    private String generateSalt() {
        byte[] salt = new byte[16];
        secureRandom.nextBytes(salt);
        return Base64.getEncoder().encodeToString(salt);
    }
    
    private String hashPassword(String password, String salt) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(Base64.getDecoder().decode(salt));
            byte[] hash = digest.digest(password.getBytes("UTF-8"));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            throw new RuntimeException("Password hashing failed", e);
        }
    }
    
    private void loadUsers() {
        if (!Files.exists(databaseFile)) {
            // Create default admin user if database doesn't exist
            createDefaultAdmin();
            return;
        }
        
        try {
            String json = Files.readString(databaseFile);
            @SuppressWarnings("unchecked")
            Map<String, Object> loadedUsersData = (Map<String, Object>) objectMapper.readValue(json, Map.class);
            
            // Convert the loaded data to User objects
            for (Map.Entry<String, Object> entry : loadedUsersData.entrySet()) {
                String username = entry.getKey();
                Object userData = entry.getValue();
                
                if (userData instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> userMap = (Map<String, Object>) userData;
                    
                    User user = new User();
                    user.username = (String) userMap.get("username");
                    user.hashedPassword = (String) userMap.get("hashedPassword");
                    user.salt = (String) userMap.get("salt");
                    user.isAdmin = (Boolean) userMap.get("isAdmin");
                    user.createdAt = ((Number) userMap.get("createdAt")).longValue();
                    user.lastModified = ((Number) userMap.get("lastModified")).longValue();
                    
                    users.put(username, user);
                }
            }
        } catch (IOException e) {
            System.err.println("Failed to load user database: " + e.getMessage());
            createDefaultAdmin();
        }
    }
    
    private void saveUsers() {
        try {
            // Ensure directory exists
            Files.createDirectories(databaseFile.getParent());
            
            String json = objectMapper.writeValueAsString(users);
            Files.writeString(databaseFile, json);
        } catch (IOException e) {
            System.err.println("Failed to save user database: " + e.getMessage());
        }
    }
    
    private void createDefaultAdmin() {
        // Create default admin user with username "admin" and password "admin"
        // This should be changed immediately after first login
        String username = "admin";
        String password = "admin";
        String salt = generateSalt();
        String hashedPassword = hashPassword(password, salt);
        
        User admin = new User(username, hashedPassword, salt, true, System.currentTimeMillis());
        users.put(username, admin);
        
        saveUsers();
        System.out.println("[UserDatabase] Created default admin user: admin/admin");
        System.out.println("[UserDatabase] WARNING: Please change the default password immediately!");
    }
    
    public static class User {
        public String username;
        public String hashedPassword;
        public String salt;
        public boolean isAdmin;
        public long createdAt;
        public long lastModified;
        
        public User() {} // For JSON deserialization
        
        public User(String username, String hashedPassword, String salt, boolean isAdmin, long createdAt) {
            this.username = username;
            this.hashedPassword = hashedPassword;
            this.salt = salt;
            this.isAdmin = isAdmin;
            this.createdAt = createdAt;
            this.lastModified = createdAt;
        }
    }
    
    public static class UserInfo {
        public final String username;
        public final boolean isAdmin;
        public final long createdAt;
        public final long lastModified;
        
        public UserInfo(String username, boolean isAdmin, long createdAt, long lastModified) {
            this.username = username;
            this.isAdmin = isAdmin;
            this.createdAt = createdAt;
            this.lastModified = lastModified;
        }
    }
}
