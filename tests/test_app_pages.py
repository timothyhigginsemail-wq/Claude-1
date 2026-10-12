"""Smoke test: every page of the web app renders without an exception."""
from pathlib import Path

import pytest

pytest.importorskip("streamlit")
from streamlit.testing.v1 import AppTest  # noqa: E402

APP = str(Path(__file__).resolve().parents[1] / "app" / "streamlit_app.py")
PAGES = ["views/home.py", "views/s1_idea.py", "views/s2_data.py", "views/s3_signal.py",
         "views/s4_predict.py", "views/s5_factors.py", "views/s6_portfolio.py",
         "views/s7_implement.py", "views/s8_evaluate.py", "views/s9_decision.py",
         "views/t_inspect.py", "views/t_compare.py", "views/l_org.py", "views/l_method.py"]


@pytest.mark.slow
@pytest.mark.parametrize("page", PAGES)
def test_page_renders(page):
    at = AppTest.from_file(APP, default_timeout=600)
    at.run()
    at.switch_page(page)
    at.run()
    assert not at.exception, [e.message for e in at.exception]
