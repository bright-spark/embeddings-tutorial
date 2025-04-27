import csv
import io
import unicodedata

def remove_invalid_chars(text):
    """Removes invalid control characters, keeping standard whitespace."""
    return "".join(ch for ch in text 
                  if unicodedata.category(ch)[0] != 'C' or ch in ('\t', '\n', '\r'))

def escape_and_format_csv_row(text_line):
    """Escapes double quotes and formats the line for CSV."""
    # Using csv writer to handle escaping properly
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL, lineterminator='')
    writer.writerow([text_line])
    formatted_line = output.getvalue()
    output.close()
    return f'{formatted_line},'

input_filename = 'dataset.html'
output_filename = 'dataset.csv' # Updated filename

try:
    with open(input_filename, 'r', encoding='utf-8') as infile, \
         open(output_filename, 'w', encoding='utf-8', newline='') as outfile:
        
        for line in infile:
            cleaned_line = remove_invalid_chars(line.strip())
            if cleaned_line:  
                formatted_row = escape_and_format_csv_row(cleaned_line)
                outfile.write(formatted_row + '\n')

    print(f"Successfully converted '{input_filename}' to '{output_filename}' with character cleaning.")

except FileNotFoundError:
    print(f"Error: Input file '{input_filename}' not found.")
except Exception as e:
    print(f"An error occurred: {e}")
