import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent / ".src"))

from haiku_generator import generate_haiku, load_existing_haikus


def test_load_existing_haikus_file_not_found(tmp_path):
    """存在しないログファイルの場合は空のsetが返るテスト"""
    non_existent = tmp_path / "not_found.log"
    result = load_existing_haikus(str(non_existent))
    assert result == set()


def test_load_existing_haikus_success(tmp_path):
    """既存の俳句ログから行ごとのセットが正しく読み込まれるテスト"""
    log_file = tmp_path / "haiku.log"
    log_file.write_text(
        "古池や 蛙飛びこむ 水の音\n\n柿くへば 鐘が鳴るなり 法隆寺\n", encoding="utf-8"
    )

    result = load_existing_haikus(str(log_file))
    assert len(result) == 2
    assert "古池や 蛙飛びこむ 水の音" in result
    assert "柿くへば 鐘が鳴るなり 法隆寺" in result


@patch("haiku_generator.get_client")
def test_generate_haiku_mock(mock_get_client):
    """さくらAI APIの呼び出しが正しくモックされ、俳句文字列が返るテスト"""
    mock_client = mock_get_client.return_value
    mock_response = type("Response", (), {})()
    mock_response.choices = [
        type(
            "Choice",
            (),
            {"message": type("Message", (), {"content": "春風や 闘志いだきて 丘に立つ"})()},
        )()
    ]
    mock_client.chat.completions.create.return_value = mock_response

    result = generate_haiku()
    assert result == "春風や 闘志いだきて 丘に立つ"
