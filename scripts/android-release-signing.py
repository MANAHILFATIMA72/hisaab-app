"""Switches the prebuilt Android release build from the debug key to the Play upload key.

Run after `expo prebuild`. The key comes from environment variables set by the workflow:
HISAAB_KEYSTORE_PATH and HISAAB_UPLOAD_PASSWORD (store and key share one password, alias "upload").
"""
import pathlib

path = pathlib.Path('android/app/build.gradle')
gradle = path.read_text()

release_config = """    signingConfigs {
        release {
            storeFile file(System.getenv('HISAAB_KEYSTORE_PATH'))
            storePassword System.getenv('HISAAB_UPLOAD_PASSWORD')
            keyAlias 'upload'
            keyPassword System.getenv('HISAAB_UPLOAD_PASSWORD')
        }
"""
assert gradle.count('    signingConfigs {\n') == 1, 'unexpected build.gradle layout'
gradle = gradle.replace('    signingConfigs {\n', release_config, 1)

marker = '        release {\n'
start = gradle.index(marker, gradle.index('buildTypes {'))
end = gradle.index('signingConfig signingConfigs.debug', start)
gradle = gradle[:end] + 'signingConfig signingConfigs.release' + gradle[end + len('signingConfig signingConfigs.debug'):]
path.write_text(gradle)
print('Release builds now signed with the upload key.')
