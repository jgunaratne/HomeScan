import SwiftUI

/// Modal shown the instant a room finishes, while the user is still standing in it.
/// Retroactive labelling from a wireframe is painful (SPEC §5.2, §8).
struct RoomLabelPromptView: View {
    let suggestion: String
    let onSubmit: (String) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var label = ""
    @State private var isSaving = false
    @FocusState private var isFocused: Bool

    private static let quickPicks = [
        "Kitchen", "Living Room", "Dining Room", "Bedroom", "Primary Bedroom",
        "Bathroom", "Ensuite", "Hallway", "Landing", "Office", "Utility",
        "Garage", "Basement", "Closet",
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Room name", text: $label)
                        .focused($isFocused)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .onSubmit(save)
                } header: {
                    Text("What room was that?")
                }

                Section {
                    FlowChips(items: Self.quickPicks, selected: label) { pick in
                        label = pick
                    }
                }
            }
            .navigationTitle("Label Room")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .disabled(isSaving)
                }
            }
            .disabled(isSaving)
            .overlay {
                if isSaving {
                    ProgressView("Saving…")
                        .padding(20)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                }
            }
        }
        .onAppear {
            label = suggestion
            isFocused = suggestion.isEmpty
        }
    }

    private func save() {
        guard !isSaving else { return }
        isSaving = true
        Task {
            await onSubmit(label)
            dismiss()
        }
    }
}

/// Wrapping chip row for the quick picks.
private struct FlowChips: View {
    let items: [String]
    let selected: String
    let onTap: (String) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(items, id: \.self) { item in
                Button {
                    onTap(item)
                } label: {
                    Text(item)
                        .font(.subheadline)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(
                            selected == item ? Color.accentColor.opacity(0.2) : Color(.tertiarySystemFill),
                            in: Capsule()
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }
}
