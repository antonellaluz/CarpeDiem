"""
Importa um CSV de notas de corte para o Supabase.
Uso:  python importar_notas.py arquivo.csv 2025
Variáveis de ambiente (NUNCA coloque no código nem no GitHub):
  SUPABASE_URL                 ex.: https://nwkhbfmfqitdfylwtctl.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    chave de serviço (Project Settings > API)
"""
import csv, os, sys
import requests

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# >>> AJUSTE ESTES NOMES para os cabeçalhos do SEU arquivo <<<
MAPA = {
    "universidade": "NOME_DA_UNIVERSIDADE",
    "curso": "NOME_DO_CURSO",
    "campus": "CAMPUS",
    "modalidade": "MODALIDADE",
    "nota": "NOTA_DE_CORTE",
}
SEPARADOR = ";"          # os CSVs do governo costumam usar ponto e vírgula
CODIFICACAO = "utf-8"    # se aparecerem símbolos estranhos, tente "latin-1"
METODO = "sisu"
FONTE = "https://dados.mec.gov.br/"   # troque pelo endereço exato do arquivo

def para_numero(texto):
    return float(str(texto).strip().replace(".", "").replace(",", ".")) \
        if "," in str(texto) else float(str(texto).strip())

def main(caminho, ano):
    linhas, ignoradas = [], 0

    with open(caminho, newline="", encoding=CODIFICACAO) as f:
        for r in csv.DictReader(f, delimiter=SEPARADOR):
            try:
                linhas.append({
                    "universidade": r[MAPA["universidade"]].strip(),
                    "curso": r[MAPA["curso"]].strip(),
                    "campus": (r.get(MAPA["campus"]) or "").strip() or None,
                    "ano": int(ano),
                    "metodo": METODO,
                    "modalidade": (r.get(MAPA["modalidade"]) or "ampla concorrência").strip().lower(),
                    "nota": para_numero(r[MAPA["nota"]]),
                    "fonte_url": FONTE,
                })
            except (KeyError, ValueError):
                ignoradas += 1

    print(f"{len(linhas)} linhas válidas, {ignoradas} ignoradas.")

    for i in range(0, len(linhas), 500):
        resp = requests.post(
            f"{URL}/rest/v1/notas_corte",
            headers={
                "apikey": KEY,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json=linhas[i:i + 500],
            timeout=60,
        )
        resp.raise_for_status()
        print(f"Enviadas {min(i + 500, len(linhas))}/{len(linhas)}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])