import logging
import logging.config
import sys
from pathlib import Path
from typing import Any

from app.config.settings import settings


def setup_logging() -> None:
    """Configure logging for the application."""
    logs_dir = Path('logs')
    logs_dir.mkdir(exist_ok=True)

    config: dict[str, Any] = {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': {
            'detailed': {
                'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                'datefmt': '%Y-%m-%d %H:%M:%S',
            },
            'simple': {'format': '%(levelname)s - %(message)s'},
            'json': {
                'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s - '
                '%(pathname)s:%(lineno)d',
                'datefmt': '%Y-%m-%d %H:%M:%S',
            },
        },
        'handlers': {
            'console': {
                'class': 'logging.StreamHandler',
                'level': 'INFO',
                'formatter': 'detailed',
                'stream': sys.stdout,
            },
            'file': {
                'class': 'logging.handlers.RotatingFileHandler',
                'level': 'DEBUG',
                'formatter': 'detailed',
                'filename': 'logs/app.log',
                'maxBytes': 10485760,  # 10MB
                'backupCount': 5,
                'encoding': 'utf8',
            },
            'error_file': {
                'class': 'logging.handlers.RotatingFileHandler',
                'level': 'ERROR',
                'formatter': 'json',
                'filename': 'logs/error.log',
                'maxBytes': 10485760,  # 10MB
                'backupCount': 5,
                'encoding': 'utf8',
            },
        },
        'loggers': {
            'app': {
                'level': 'DEBUG' if settings.DEBUG else 'INFO',
                'handlers': ['console', 'file', 'error_file'],
                'propagate': False,
            },
            'uvicorn': {'level': 'INFO', 'handlers': ['console', 'file'], 'propagate': False},
            'fastapi': {'level': 'INFO', 'handlers': ['console', 'file'], 'propagate': False},
        },
        'root': {'level': 'INFO', 'handlers': ['console', 'file']},
    }

    logging.config.dictConfig(config)


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance for the given name."""
    return logging.getLogger(f'app.{name}')


# Setup logging when module is imported
setup_logging()

# Create a default logger for the app
logger = get_logger('main')
