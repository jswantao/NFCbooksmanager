# backend/test_api.py
import requests
import json

BASE_URL = "http://localhost:8000/api"

def test_sync():
    print("\n📚 测试图书同步...")
    test_isbns = [
        "9787020002207",  # 红楼梦
        "9787532768998",  # 百年孤独
    ]
    
    for isbn in test_isbns:
        try:
            response = requests.post(
                f"{BASE_URL}/books/sync",
                json={"isbn": isbn}
            )
            print(f"\nISBN: {isbn}")
            print(f"状态码: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"成功: {data.get('message')}")
                book = data.get('book', {})
                print(f"书名: {book.get('title')}")
                print(f"作者: {book.get('author')}")
            else:
                print(f"失败: {response.text}")
        except Exception as e:
            print(f"错误: {e}")

def test_shelves():
    print("\n📖 测试书架查询...")
    try:
        response = requests.get(f"{BASE_URL}/shelves/1/books")
        print(f"状态码: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"书架: {data.get('shelf_name')}")
            print(f"图书数量: {data.get('total_count')}")
    except Exception as e:
        print(f"错误: {e}")

if __name__ == "__main__":
    test_sync()
    test_shelves()