import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

from tanita_sync import DEFAULT_HEIGHT_CM, update_tanita_data_store


def test_update_tanita_data_store(tmp_path):
    """タニタの生データからBMIが正確に計算され、日付昇順でマージされるかのテスト"""
    test_file = tmp_path / "tanita_test.json"

    # サンプル生データ（未ソート）
    raw_data = [
        {"date": "202610122000", "tag": "6021", "keydata": "70.0"},
        {"date": "202610122000", "tag": "6022", "keydata": "20.0"},
        {"date": "202610111900", "tag": "6021", "keydata": "69.5"},
        {"date": "202610111900", "tag": "6022", "keydata": "19.5"},
        # 不正なデータ（スキップされるべき）
        {"date": "invalid_date", "tag": "6021", "keydata": "70.0"},
        {"date": "202610132100", "tag": "6021", "keydata": "not_a_number"},
    ]

    store = update_tanita_data_store(raw_data, filepath=str(test_file))

    assert store["height_cm"] == DEFAULT_HEIGHT_CM
    records = store["records"]
    assert len(records) == 2

    # 日付昇順（古い順）になっているか
    assert records[0]["date"] == "2026-10-11 19:00"
    assert records[0]["weight"] == 69.5
    assert records[0]["fat"] == 19.5
    # BMI = 69.5 / (1.75 * 1.75) = 22.6938... -> 22.69
    assert records[0]["bmi"] == 22.69

    assert records[1]["date"] == "2026-10-12 20:00"
    assert records[1]["weight"] == 70.0
    assert records[1]["fat"] == 20.0
    # BMI = 70.0 / (1.75 * 1.75) = 22.857... -> 22.86
    assert records[1]["bmi"] == 22.86

    # ファイルに保存されたJSONの整合性確認
    with open(test_file, encoding="utf-8") as f:
        saved_json = json.load(f)
    assert len(saved_json["records"]) == 2
