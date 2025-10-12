#!/bin/bash

echo "Deploying Campus Lost & Found Platform to Firebase..."
echo

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "Firebase CLI is not installed. Please install it first:"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "Please login to Firebase first:"
    echo "firebase login"
    exit 1
fi

# Deploy to Firebase
echo "Deploying to Firebase..."
firebase deploy

if [ $? -eq 0 ]; then
    echo
    echo "✅ Deployment successful!"
    echo "Your app is now live on Firebase Hosting."
else
    echo
    echo "❌ Deployment failed. Please check the error messages above."
    exit 1
fi




