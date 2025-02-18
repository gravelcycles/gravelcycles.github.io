#!/usr/bin/env python3

import sys
import argparse

def main():
    parser = argparse.ArgumentParser(description="Replace placeholder in HTML file with CSV content.")
    parser.add_argument("-f", "--html_file", default="index.html", help="Path to the HTML file (default: index.html)") # Changed short option to -f
    parser.add_argument("-o", "--output_file", default="compare.html", help="Path to output file")
    parser.add_argument("-c", "--csv_file", default="freetones.csv", help="Path to the CSV file (default: freetones.csv)")

    args = parser.parse_args()

    html_file = args.html_file
    csv_file = args.csv_file
    out_file = args.output_file

    try:
        with open(csv_file, 'r') as f_csv:
            csv_content = f_csv.read()
    except FileNotFoundError:
        print(f"Error: CSV file '{csv_file}' not found.")
        sys.exit(1)

    try:
        with open(html_file, 'r') as f_html:
            html_content = f_html.read()
    except FileNotFoundError:
        print(f"Error: HTML file '{html_file}' not found.")
        sys.exit(1)

    modified_html_content = html_content.replace("$$$TODO_INPUT_CSV$$$", csv_content)

    try:
        with open(out_file, 'w') as f_html_out:
            f_html_out.write(modified_html_content)
    except Exception as e:
        print(f"Error writing to HTML file '{html_file}': {e}")
        sys.exit(1)

    print(f"Placeholder $$$TODO_INPUT_CSV$$$ in '{html_file}' replaced with content of '{csv_file}' (using Python).")

if __name__ == "__main__":
    main()
