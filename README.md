# Campus Lost & Found Platform

A modern, responsive web application built with HTML, CSS, JavaScript, and Firebase for managing lost and found items on campus.

## 🚀 Features

- **User Authentication**: Secure login/signup with Firebase Authentication (email/password + Google)
- **Item Management**: Report, view, edit, and delete lost/found items
- **Categories**: Classify items (Electronics, Documents, ID Card, Clothing, Accessories, Books & Stationery, Others)
- **Image Upload**: Upload and store item images using Firebase Storage
- **Real-time Database**: Store and retrieve items using Firestore
- **Responsive Design**: Mobile-friendly interface with Bootstrap 5 and custom modern UI
- **Search & Filter**: Find items by title, description, location, status, or category
- **User Dashboard**: View and manage your own reported items
- **History View**: Dedicated page to browse resolved items and summary stats
- **Admin Dashboard**: Review all items, claims, and building enquiries (admin only)

## 📁 Project Structure

```
lost-found-platform/
├── index.html          # Home page - displays all items
├── report.html         # Report new lost/found items
├── login.html          # User authentication
├── myitems.html        # User's personal items dashboard
├── item.html           # Individual item details page
├── style.css           # Custom CSS styles
├── script.js           # Main JavaScript application logic
├── firebase.json       # Firebase hosting configuration
├── firestore.rules     # Firestore security rules
├── firestore.indexes.json # Firestore database indexes
├── storage.rules       # Firebase Storage security rules
└── README.md           # This file
```

## 🛠️ Setup Instructions

### 1. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable the following services:
   - **Authentication** (Email/Password)
   - **Firestore Database**
   - **Storage**
   - **Hosting**

### 2. Configure Firebase

1. In your Firebase project, go to **Project Settings** > **General**
2. Scroll down to **Your apps** and click **Add app** > **Web**
3. Register your app and copy the Firebase configuration
4. Open `script.js` and replace the placeholder configuration:

```javascript
const firebaseConfig = {
    apiKey: "your-api-key-here",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};
```

### 3. Set Up Authentication

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Email/Password** provider
3. Optionally, configure authorized domains for your hosting

### 4. Configure Firestore

1. Go to **Firestore Database** > **Rules**
2. The rules are already configured in `firestore.rules`
3. Deploy the rules using Firebase CLI or copy them manually

### 5. Configure Storage

1. Go to **Storage** > **Rules**
2. The rules are already configured in `storage.rules`
3. Deploy the rules using Firebase CLI or copy them manually

### 6. Deploy to Firebase Hosting

#### Option A: Using Firebase CLI (Recommended)

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize your project:
   ```bash
   firebase init
   ```
   - Select **Hosting**
   - Choose your Firebase project
   - Set public directory to `.` (current directory)
   - Configure as single-page app: **Yes**
   - Don't overwrite index.html: **No**

4. Deploy:
   ```bash
   firebase deploy
   ```

#### Option B: Manual Upload

1. Go to **Hosting** in Firebase Console
2. Click **Get started**
3. Upload all files to the hosting directory

## 🔧 Configuration Details

### Firestore Security Rules

The application uses secure Firestore rules that:
- Allow authenticated users to read all items
- Only allow users to create, update, or delete their own items
- Validate item data structure

### Storage Rules

Firebase Storage rules:
- Allow authenticated users to read all images
- Allow authenticated users to upload images (max 5MB)
- Only accept image file types

### Database Structure

Items are stored in Firestore with a structure similar to:

```javascript
{
  title: "Item Title",
  description: "Detailed description",
  location: "Where it was found/lost",
  status: "Lost" | "Found" | "resolved" | "returned" | "claimed",
  date: "YYYY-MM-DD",
  category: "Electronics" | "Documents" | "ID Card" | "Clothing" | "Accessories" | "Books & Stationery" | "Others" | null,
  imageUrl: "https://storage.googleapis.com/...",
  userId: "user-uid",
  userEmail: "user@example.com",
  createdAt: timestamp,
  updatedAt: timestamp
  // Optional fields used for resolution and building enquiry flows
  givenToEnquiry: boolean,
  enquiryName: string | null,
  enquiryPhone: string | null,
  resolvedAt: timestamp | null
}
```

## 🎨 Customization

### Styling
- Modify `style.css` to change colors, fonts, and layout
- The app uses Bootstrap 5 with custom CSS overrides
- Color scheme uses a purple gradient theme

### Features
- Add new fields to items by updating the form, Firestore rules, and the mapping logic in `script.js`
- Modify validation rules in `firestore.rules`
- Add new pages by creating HTML files and updating navigation

## 🚀 Usage

1. **Home Page**: Browse all active lost and found items with search + status/category filters.
2. **Report Item**: Login and report new items with optional images and category selection.
3. **My Items**: View and manage your reported items (users see only **Edit** and **Delete** on their own items).
4. **History**: See a history of resolved items, including whether they were handed to enquiry or resolved directly.
5. **Search & Filter**: Use debounced search and filters to quickly narrow down items.
6. **Admin Dashboard**: Admins can review all items, approve/reject claims, and view building enquiries.

## 🔒 Security Features

- User authentication required for reporting items
- Users can only edit/delete their own items
- Image upload size limits (5MB)
- Input validation and sanitization
- Secure Firestore and Storage rules

## 📱 Responsive Design

The application is fully responsive and works on:
- Desktop computers
- Tablets
- Mobile phones
- Various screen sizes

## 🐛 Troubleshooting

### Common Issues

1. **Firebase configuration not working**
   - Check that you've replaced the placeholder config
   - Verify your Firebase project settings

2. **Authentication not working**
   - Ensure Email/Password is enabled in Firebase Console
   - Check that your domain is authorized

3. **Images not uploading**
   - Verify Storage rules are deployed
   - Check file size (must be under 5MB)
   - Ensure file is an image type

4. **Items not loading**
   - Check Firestore rules are deployed
   - Verify your Firebase project ID is correct

### Debug Mode

- Open browser developer tools to see console logs for debugging.
- The app includes basic global error handling for uncaught errors and promise rejections and will surface friendly alerts to users.

## 📄 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📞 Support

For support, please check the troubleshooting section or create an issue in the project repository.

---

**Note**: Remember to replace the Firebase configuration in `script.js` with your actual project credentials before deploying!




