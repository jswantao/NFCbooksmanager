"""Jinja2 模板引擎配置"""

from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

_templates_dir = Path(__file__).resolve().parent.parent / "templates"

env = Environment(
    loader=FileSystemLoader(str(_templates_dir)),
    autoescape=select_autoescape(["html"]),
)


def render_template(name: str, **context) -> str:
    """渲染指定模板"""
    template = env.get_template(name)
    return template.render(**context)
