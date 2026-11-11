import pytest


@pytest.mark.api
@pytest.mark.contract
@pytest.mark.integration
def test_health(qa_api):
    """Check the service health endpoint after business integration."""
    response = qa_api.get('/health')
    assert response.status_code == 200
