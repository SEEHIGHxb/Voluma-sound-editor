import os
import glob
import sys

def rename_wav_files():
    print("=" * 60)
    print("                 WAV File Renaming Utility")
    print("=" * 60)
    
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"Target directory: {script_dir}\n")
    
    # Change current working directory to the script's directory
    try:
        os.chdir(script_dir)
    except Exception as e:
        print(f"Error: Could not access directory '{script_dir}'. {e}")
        return

    # Find and sort all .wav / .WAV files
    wav_files = []
    for ext in ['*.wav', '*.WAV']:
        wav_files.extend(glob.glob(ext))
    
    # Remove duplicates and exclude the script file itself (though it's a .py, just in case)
    wav_files = list(set(wav_files))
    wav_files.sort()
    
    if not wav_files:
        print("No .wav files found in this directory.")
        return
        
    print(f"Found {len(wav_files)} .wav files in this folder.")
    
    # Ask the user for the new base name
    base_name = input("\nEnter the new base name for the files (e.g., 'female_voice'): ").strip()
    while not base_name:
        print("Base name cannot be empty.")
        base_name = input("Enter the new base name: ").strip()
        
    # Preview the changes
    print("\n--- RENAME PREVIEW ---")
    preview_limit = 10
    renames = []
    
    for idx, filename in enumerate(wav_files, start=1):
        ext = os.path.splitext(filename)[1].lower()  # keep extension lowercase (.wav)
        new_name = f"{base_name}_{idx}{ext}"
        renames.append((filename, new_name))
        
        if idx <= preview_limit:
            print(f"  {filename}  ==>  {new_name}")
            
    if len(wav_files) > preview_limit:
        print(f"  ... and {len(wav_files) - preview_limit} more files.")
    print("-" * 22)
    
    # Get confirmation
    confirm = input(f"\nAre you sure you want to rename these {len(wav_files)} files? (y/n): ").strip().lower()
    if confirm not in ['y', 'yes']:
        print("Renaming cancelled. No files were changed.")
        return
        
    # Perform the actual renaming
    success_count = 0
    failure_count = 0
    
    print("\nRenaming files...")
    for old_name, new_name in renames:
        if os.path.exists(new_name) and old_name != new_name:
            print(f"Skipping '{old_name}' -> '{new_name}': Destination file already exists.")
            failure_count += 1
            continue
            
        try:
            os.rename(old_name, new_name)
            success_count += 1
        except Exception as e:
            print(f"Failed to rename '{old_name}' to '{new_name}': {e}")
            failure_count += 1
            
    print("\n" + "=" * 40)
    print(f"Renaming Completed!")
    print(f"Successfully renamed: {success_count} files.")
    if failure_count > 0:
        print(f"Failed / Skipped:     {failure_count} files.")
    print("=" * 40)

if __name__ == "__main__":
    try:
        rename_wav_files()
    except KeyboardInterrupt:
        print("\n\nOperation interrupted by user.")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
    finally:
        # Keep the command prompt window open so it doesn't close immediately when double-clicked
        print("\n" + "-" * 40)
        input("Press Enter to exit...")
        sys.exit(0)
