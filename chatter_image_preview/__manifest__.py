{
    'name': 'Chatter Image Preview',
    'version': '18.0.1.3.0',
    'summary': 'Preview images, PDFs, CSVs, Markdown and Excel files from the Chatter',
    'description': """
Modifies the Chatter attachment behaviour so that clicking on an image, PDF,
CSV, Markdown or Excel file opens a native preview instead of triggering a
browser download or opening the file in a new tab.
    """,
    'author': 'TwenTIC',
    'website': 'https://www.twentic.com',
    'category': 'Discuss',
    'license': 'LGPL-3',
    'depends': ['mail', 'web'],
    'data': [],
    'assets': {
        'web.assets_backend': [
            'chatter_image_preview/static/src/components/attachment_preview_dialog/attachment_preview_dialog.xml',
            'chatter_image_preview/static/src/components/attachment_preview_dialog/attachment_preview_dialog.js',
            'chatter_image_preview/static/src/attachment_card_patch/attachment_card_patch.js',
        ],
    },
    'images': ['static/description/main_screenshot.png'],
    'installable': True,
    'application': False,
    'auto_install': False,
}
