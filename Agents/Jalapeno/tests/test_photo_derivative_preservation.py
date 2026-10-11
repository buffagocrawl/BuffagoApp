"""Isolated storage fixtures; never connect to Supabase."""
import sys
from pathlib import Path
from uuid import uuid4
from types import SimpleNamespace
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from wing_processing_worker.photo_derivatives import PhotoDerivativeRepository
from wing_processing_worker.errors import ExistingDerivativeConflict, RetryableWorkerError
from wing_processing_worker.models import ProcessingContext, ProcessingClaim, JobKind
from wing_processing_worker.worker import WingProcessingWorker
from wing_processing_worker.moderation import ManualReviewProvider
from wing_media_processing import WingMediaProcessor
from supabase_client import SupabaseClient, SupabaseConfig


class Storage:
    def __init__(self):
        self.objects = {}
        self.uploads = []
        self.fail_path = None
        self.race = None

    def list_storage_objects(self, bucket, *, prefix):
        return [{'name': p.rsplit('/', 1)[1], 'metadata': {'mimetype': v[1], 'size': len(v[0])}}
                for p, v in self.objects.items() if p.rsplit('/', 1)[0] == prefix]

    def download_storage_object(self, bucket, path, *, maximum_bytes):
        return self.objects[path][0][:maximum_bytes + 1]

    def create_storage_object(self, bucket, path, *, data, content_type):
        if path == self.fail_path:
            raise OSError('temporary failure')
        if self.race:
            self.objects[path] = (data if self.race == 'valid' else b'incompatible', content_type)
            raise RuntimeError('concurrent object creation')
        assert path not in self.objects, 'must not overwrite'
        self.objects[path] = (data, content_type)
        self.uploads.append(path)


class Repository(PhotoDerivativeRepository):
    def __init__(self, source):
        super().__init__(Storage())
        submission = uuid4()
        self.context = ProcessingContext(submission, 'photo', 'wing-submissions',
            f'originals/{uuid4()}/{submission}/source', f'processed/{submission}/primary',
            f'thumbnails/{submission}/preview', uuid4())
        self.source = source
        self.revalidations = 0
        self.claim_value = ProcessingClaim(uuid4(), submission, JobKind.PHOTO, uuid4())

    def _revalidate(self, context):
        assert context == self.context
        self.revalidations += 1

    def claim(self, **kwargs):
        return self.claim_value

    def begin(self, claim):
        return self.context

    def download_original(self, context, destination, **kwargs):
        destination.write_bytes(self.source.read_bytes())

    def register_exact_media(self, *args, **kwargs):
        return False

    def fingerprint_candidates(self, *args, **kwargs):
        return []

    def record_moderation(self, *args, **kwargs):
        pass

    def record_fingerprint(self, *args, **kwargs):
        pass

    def settle_success(self, *args, **kwargs):
        return {'job_status': 'succeeded', 'submission_status': 'in_review'}

    def settle_failure(self, *args, **kwargs):
        return {'job_status': 'retry' if kwargs['retryable'] else 'dead'}


@pytest.fixture
def repository(tmp_path):
    source = tmp_path / 'source.png'
    exif = Image.Exif(); exif[270] = 'private source metadata'
    Image.new('RGB', (800, 600), (150, 60, 20)).save(source, exif=exif)
    return Repository(source)


def test_partial_failure_retry_reuses_valid_bytes_and_only_uploads_missing(repository):
    worker = WingProcessingWorker(repository=repository, processor=WingMediaProcessor(),
        moderation_provider=ManualReviewProvider(), worker_id='preservation-test')
    repository.client.fail_path = repository.context.processed_path
    assert worker.run_once().status == 'RETRY'
    preserved = dict(repository.client.objects)
    assert len(preserved) == 2
    repository.client.fail_path = None
    assert worker.run_once().status == 'IN_REVIEW'
    assert all(repository.client.objects[path] == value for path, value in preserved.items())
    assert len(repository.client.uploads) == len(set(repository.client.uploads)) == 4
    assert repository.revalidations >= 8
    import io
    for data, mime in repository.client.objects.values():
        with Image.open(io.BytesIO(data)) as photo:
            assert mime == 'image/jpeg' and photo.format == 'JPEG'
            assert not photo.getexif()


@pytest.mark.parametrize('race', ['valid', 'invalid'])
def test_concurrent_create_verifies_winner_without_overwrite(repository, tmp_path, race):
    artifact = tmp_path / 'artifact'; artifact.write_bytes(b'expected-current-source-derivative')
    repository.client.race = race
    if race == 'invalid':
        with pytest.raises(ExistingDerivativeConflict):
            repository.upload_artifact(repository.context, storage_path=repository.context.processed_path, local_path=artifact, content_type='image/jpeg')
        assert repository.client.objects[repository.context.processed_path][0] == b'incompatible'
    else:
        repository.upload_artifact(repository.context, storage_path=repository.context.processed_path, local_path=artifact, content_type='image/jpeg')
        assert repository.client.objects[repository.context.processed_path][0] == artifact.read_bytes()
    assert not repository.client.uploads


@pytest.mark.parametrize('value', [(b'wrong-source', 'image/jpeg'), (b'expected', 'image/png')])
def test_invalid_existing_object_is_preserved(repository, tmp_path, value):
    artifact = tmp_path / 'artifact'; artifact.write_bytes(b'expected')
    repository.client.objects[repository.context.processed_path] = value
    with pytest.raises(ExistingDerivativeConflict):
        repository.upload_artifact(repository.context, storage_path=repository.context.processed_path, local_path=artifact, content_type='image/jpeg')
    assert repository.client.objects[repository.context.processed_path] == value
    assert not repository.client.uploads


def test_same_length_different_source_is_incompatible(repository, tmp_path):
    artifact = tmp_path / 'artifact'; artifact.write_bytes(b'expected')
    repository.client.objects[repository.context.processed_path] = (b'different'[:8], 'image/jpeg')
    with pytest.raises(ExistingDerivativeConflict):
        repository.upload_artifact(repository.context, storage_path=repository.context.processed_path, local_path=artifact, content_type='image/jpeg')


def test_create_only_uses_post_without_affecting_legacy_upload_endpoint():
    client = SupabaseClient(SupabaseConfig('https://example.invalid', 'fixture-secret'))
    calls = []
    response = SimpleNamespace(status_code=200, content=b'', json=lambda: {})
    client._session = SimpleNamespace(post=lambda *a, **k: (calls.append(('POST', a, k)) or response),
                                     put=lambda *a, **k: (calls.append(('PUT', a, k)) or response))
    client.create_storage_object('wing-submissions', 'processed/fixture/primary', data=b'jpeg', content_type='image/jpeg')
    client.upload_storage_object('wing-submissions', 'legacy', data=b'jpeg', content_type='image/jpeg', upsert=True)
    assert calls[0][0] == 'POST' and calls[0][2]['headers']['x-upsert'] == 'false'
    assert calls[1][0] == 'PUT' and calls[1][2]['headers']['x-upsert'] == 'true'


def test_reviewer_cli_cannot_run_without_a_submission_scope():
    from wing_processing_worker.cli import main
    with pytest.raises(SystemExit) as error:
        main(['--photo-once', '--photo-review-only'])
    assert error.value.code == 2
