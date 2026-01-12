import pandas as pd
import sys

sys.stdout.reconfigure(encoding='utf-8')

df = pd.read_excel(r'C:\Users\hyunj\Downloads\[도매]호남 판매 내역서.xlsx', sheet_name='도매 리스트', header=1)
df_filtered = df.dropna(subset=['날짜'])

print('컬럼 목록:')
for i, col in enumerate(df_filtered.columns.tolist()):
    print(f"{i}: {col}")

print('\n진행사항 컬럼이 있는지 확인:')
progress_cols = [col for col in df_filtered.columns if '진행' in str(col)]
print(f"진행 관련 컬럼: {progress_cols}")

if progress_cols:
    for col in progress_cols:
        print(f"\n'{col}' 값 분포:")
        print(df_filtered[col].value_counts())
