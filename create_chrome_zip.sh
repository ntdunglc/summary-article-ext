#!/bin/bash

# --- Configuration ---
# Get version from manifest.json
# Uses jq (a lightweight JSON processor) if available for robustness, otherwise uses grep (less reliable if format changes)
if command -v jq &> /dev/null; then
    VERSION=$(jq -r .version manifest.json)
else
    echo "Warning: 'jq' not found. Trying grep to find version (less reliable)."
    VERSION=$(grep '"version":' manifest.json | head -n 1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')
fi

if [ -z "$VERSION" ]; then
    echo "Error: Could not determine version from manifest.json. Please install 'jq' or check manifest format."
    exit 1
fi

ZIP_FILENAME="ai-summarizer-v${VERSION}.zip"
SOURCE_DIR="." # Assumes script is run from the root of the extension project

# Files and Directories to include explicitly (can use '*' below instead if preferred)
# We will use '*' and exclusions for simplicity

# --- Exclusions ---
# Add patterns here for files/folders to exclude from the zip
EXCLUDE_PATTERNS=(
    "*.zip"                  # Exclude previous zip files
    "*.xpi"                  # Exclude firefox packages
    "*.sh"                   # Exclude shell scripts (like this one)
    ".git/*"                 # Exclude all git data
    ".gitignore"             # Exclude gitignore file
    "README.md"              # Exclude README
    "assistant_instruction.txt" # Exclude instructions
    ".DS_Store"              # Exclude macOS specific files
    "__MACOSX/*"             # Exclude macOS resource forks in zip
    "*.bak"                  # Exclude backup files
    "node_modules/*"         # Exclude node_modules if present
    "summary-article-ext-firefox/*" # Exclude Firefox conversion output dir
    # Add any other files/folders specific to your setup to exclude
)

# Build the exclusion arguments for the zip command
EXCLUDE_ARGS=()
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDE_ARGS+=("-x" "$pattern")
done

# --- Create ZIP ---
echo "Creating Chrome Extension package..."
echo "Source Directory: $(pwd)"
echo "Output Filename: ${ZIP_FILENAME}"
echo "Version: ${VERSION}"

# Remove old zip file if it exists
if [ -f "${ZIP_FILENAME}" ]; then
    echo "Removing existing file: ${ZIP_FILENAME}"
    rm "${ZIP_FILENAME}"
fi

# Create the zip file including hidden files (like .*) at the root, but excluding specified patterns
# The 'cd' command is crucial so paths inside the zip are relative to the project root
(
    cd "$SOURCE_DIR" || exit 1 # Enter the source directory
    zip -r -FS "../${ZIP_FILENAME}" ./* ./.[!.]*? "${EXCLUDE_ARGS[@]}"
    # Explanation:
    # -r : Recurse into directories
    # -FS: Sync filesystem contents (ensure consistency)
    # ../${ZIP_FILENAME} : Output file path (places it one level up from SOURCE_DIR)
    # ./* : Include all visible files and folders in the current directory
    # ./.[!.]*? : Include hidden files/folders (like .*) directly under current dir, excluding '.' and '..'
    # "${EXCLUDE_ARGS[@]}" : Pass all the exclusion patterns
)

# --- Check Result ---
if [ $? -eq 0 ]; then
    echo ""
    echo "Successfully created package: ${ZIP_FILENAME}"
    echo "This file is ready for upload to the Chrome Web Store."
else
    echo ""
    echo "Error: Failed to create package."
    exit 1
fi

exit 0