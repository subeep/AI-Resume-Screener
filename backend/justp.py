
from dotenv import load_dotenv
load_dotenv()
import os, requests

url = os.getenv('SUPABASE_URL')
anon_key = os.getenv('SUPABASE_ANON_KEY')

# Paste your FULL access token here (get it from the browser signIn data log)
token = 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImZhNjIwMzdiLTcyMmMtNGMxMS1iOWU2LTU4NDY4ZjdlZGYwZiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2VldGJkeXhidW1keHF0Y2Z0d3diLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJkYTUzOWEzYy00N2ZhLTQwMzQtYWFlZS05MWIwM2FjZDA3NzIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc3OTc1NjE4LCJpYXQiOjE3Nzc5NzIwMTgsImVtYWlsIjoic3VkZWVwdGVtYWlsMUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoic3VkZWVwdGVtYWlsMUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJkYTUzOWEzYy00N2ZhLTQwMzQtYWFlZS05MWIwM2FjZDA3NzIifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc3Nzk2MzA2OX1dLCJzZXNzaW9uX2lkIjoiY2UxMWFiMzEtNTE4Ny00NjFlLThiZjEtMTJlZTlkMWEyYjk4IiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.RvFQrDw45IPSyCu0Pq5MX2wfhiZsDvfDm9hMyXeFtE8gbYJMC_t6x1eoUpCbT6Yk7kYb0lf6Xv94VJH_xElRdQ'

resp = requests.get(
    f'{url}/auth/v1/user',
    headers={
        'apikey': anon_key,
        'Authorization': f'Bearer {token}',
    },
    timeout=5,
)
print('Status:', resp.status_code)
print('Response:', resp.text[:300])
